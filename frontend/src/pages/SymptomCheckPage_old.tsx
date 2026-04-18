import React, { useMemo, useState } from "react";
import { useCreateSymptomSession } from "../api/queries";
import {
  startSymptomCheck,
  getFollowupQuestions,
  finalizeAssessment,
  type FollowupQuestion,
  type FinalAssessment,
  type InitialAssessment,
} from "../symptomCheck/symptomLlmClient";
import {
  validateInitialAssessment,
  validateFollowupQuestionResponse,
  validateFinalAssessment,
} from "../symptomCheck/validatePayloads";
import { getTriageLevelColor, getTriageLevelLabel } from "../symptomCheck/types";

type FlowStep = "intake" | "initial_questions" | "followup" | "results";

const INSURANCE_OPTIONS = [
  { id: "united", label: "United Healthcare" },
  { id: "elevance", label: "Elevance" },
  { id: "aetna", label: "Aetna" },
  { id: "centene", label: "Centene" },
  { id: "other", label: "Other (Enter manually)" },
] as const;

type InsuranceId = (typeof INSURANCE_OPTIONS)[number]["id"];

const MOCK_HOSPITALS = [
  {
    name: "Riverside Medical Center",
    distance: "1.2 mi",
    address: "1200 Harbor Blvd",
    careExample: "an urgent evaluation for acute abdominal pain",
    costLow: 420,
    costHigh: 1180,
    costMid: 780,
  },
  {
    name: "Summit Regional Hospital",
    distance: "3.4 mi",
    address: "88 Lakeside Dr",
    careExample: "an urgent evaluation for acute abdominal pain",
    costLow: 380,
    costHigh: 1050,
    costMid: 695,
  },
  {
    name: "Oakwood Emergency Pavilion",
    distance: "4.8 mi",
    address: "401 Northcrest Ave",
    careExample: "an urgent evaluation for acute abdominal pain",
    costLow: 510,
    costHigh: 1320,
    costMid: 895,
  },
] as const;

function insuranceLabel(id: InsuranceId): string {
  return INSURANCE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

function buildCostNarrative(
  insurerLabel: string,
  hospital: (typeof MOCK_HOSPITALS)[number],
): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `Based on publicly posted in-network prices for ${insurerLabel} tied to ${hospital.name} for ${hospital.careExample}, many plans show negotiated amounts roughly between ${fmt(hospital.costLow)} and ${fmt(hospital.costHigh)}, with a common midpoint around ${fmt(hospital.costMid)}.\n\nThis is not your personal cost; your deductible/coinsurance can change what you pay.`;
}

const SymptomCheckPage: React.FC = () => {
  // Flow steps
  const [step, setStep] = useState<FlowStep>("intake");

  // Intake state
  const [symptoms, setSymptoms] = useState("");
  const [insurance, setInsurance] = useState<InsuranceId | "">("");
  const [manualInsurance, setManualInsurance] = useState({
    provider: "",
    plan: "",
    memberId: "",
  });

  // Initial assessment state
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [initialAssessment, setInitialAssessment] =
    useState<InitialAssessment | null>(null);
  const [initialLoading, setInitialLoading] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);

  // Followup questions state
  const [followupQuestions, setFollowupQuestions] = useState<
    FollowupQuestion[]
  >([]);
  const [followupAnswers, setFollowupAnswers] = useState<
    Record<string, string | number | boolean>
  >({});
  const [followupLoading, setFollowupLoading] = useState(false);
  const [followupError, setFollowupError] = useState<string | null>(null);

  // Final results state
  const [finalAssessment, setFinalAssessment] = useState<FinalAssessment | null>(
    null
  );
  const [finalLoading, setFinalLoading] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);

  const createSessionMutation = useCreateSymptomSession();

  const intakeValid = symptoms.trim().length > 0 && (
    (insurance !== "" && insurance !== "other") ||
    (insurance === "other" && manualInsurance.provider.trim().length > 0)
  );

  const insurerLabel = useMemo(
    () => (insurance ? insuranceLabel(insurance) : ""),
    [insurance],
  );

  // Start symptom check - submit initial symptoms
  const handleStartAssessment = async () => {
    if (!intakeValid) return;

    setInitialLoading(true);
    setInitialError(null);

    try {
      const insuranceDetails = insurance === "other"
        ? {
            plan: manualInsurance.plan,
            provider: manualInsurance.provider,
            memberId: manualInsurance.memberId,
          }
        : {
            plan: insurance,
            provider: insuranceLabel(insurance),
          };

      // Create session first
      const sessionData = await new Promise((resolve, reject) => {
        createSessionMutation.mutate(
          { insurance_details: insuranceDetails },
          {
            onSuccess: (data) => resolve(data),
            onError: (error) => reject(error),
          }
        );
      });

      // Start LLM assessment
      const result = await startSymptomCheck(
        symptoms,
        insuranceDetails
      );

      const validated = validateInitialAssessment(result.assessment);
      if (!validated) {
        throw new Error("Invalid assessment response from AI");
      }

      setSessionId(result.session_id);
      setInitialAssessment(validated);

      // If AI thinks we need followup questions, move to that step
      if (validated.needs_followup) {
        setStep("initial_questions");
      } else {
        // Skip directly to results
        await handleFinalizeDirectly(result.session_id, validated);
      }
    } catch (error) {
      setInitialError(
        error instanceof Error ? error.message : "Failed to assess symptoms"
      );
    } finally {
      setInitialLoading(false);
    }
  };

  // Get followup questions based on initial assessment
  const handleRequestFollowup = async () => {
    if (!sessionId) return;

    setFollowupLoading(true);
    setFollowupError(null);

    try {
      const result = await getFollowupQuestions(sessionId, {});

      const validated = validateFollowupQuestionResponse(result);
      if (!validated) {
        throw new Error("Invalid followup questions from AI");
      }

      setFollowupQuestions(validated.questions);

      // If AI determined we should skip followup and go straight to results
      if (validated.should_proceed_to_results) {
        // Go directly to finalization
        setStep("results");
        await handleFinalize();
      } else {
        // Show the followup questions
        setStep("followup");
      }
    } catch (error) {
      setFollowupError(
        error instanceof Error ? error.message : "Failed to generate questions"
      );
    } finally {
      setFollowupLoading(false);
    }
  };

  // Handle followup question answer
  const handleFollowupAnswer = (
    questionId: string,
    answer: string | number | boolean
  ) => {
    setFollowupAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  // Submit followup answers and finalize
  const handleFinalize = async () => {
    if (!sessionId) return;

    setFinalLoading(true);
    setFinalError(null);

    try {
      const result = await finalizeAssessment(sessionId, followupAnswers);

      const validated = validateFinalAssessment(result);
      if (!validated) {
        throw new Error("Invalid assessment result from AI");
      }

      setFinalAssessment(validated);
      setStep("results");
    } catch (error) {
      setFinalError(
        error instanceof Error ? error.message : "Failed to finalize assessment"
      );
    } finally {
      setFinalLoading(false);
    }
  };

  // Directly finalize without followup questions
  const handleFinalizeDirectly = async (
    sId: number,
    assessment: InitialAssessment
  ) => {
    setFinalLoading(true);
    setFinalError(null);

    try {
      const result = await finalizeAssessment(sId, {
        initial_assessment: assessment,
      });

      const validated = validateFinalAssessment(result);
      if (!validated) {
        throw new Error("Invalid assessment result from AI");
      }

      setFinalAssessment(validated);
      setStep("results");
    } catch (error) {
      setFinalError(
        error instanceof Error ? error.message : "Failed to finalize assessment"
      );
    } finally {
      setFinalLoading(false);
    }
  };

  const stepIndex = step === "intake" ? 1 : step === "initial_questions" ? 2 : step === "followup" ? 3 : 4;

  const restart = () => {
    setStep("intake");
    setSymptoms("");
    setInsurance("");
    setManualInsurance({
      provider: "",
      plan: "",
      memberId: "",
    });
    setSessionId(null);
    setInitialAssessment(null);
    setFollowupQuestions([]);
    setFollowupAnswers({});
    setFinalAssessment(null);
    setInitialError(null);
    setFollowupError(null);
    setFinalError(null);
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12 pb-16">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold uppercase tracking-wider mb-4 border border-secondary-fixed-dim/30">
              <span className="material-symbols-outlined text-sm">
                assignment
              </span>
              Guided assessment
            </div>
            <h1 className="text-3xl md:text-5xl font-headline font-extrabold text-primary tracking-tight mb-2">
              Symptom Check
            </h1>
            <p className="text-on-surface-variant font-body text-base max-w-2xl">
              Answer a questionnaire about your symptoms. Our AI-powered system
              narrows down possible causes through targeted questions, then
              highlights possible conditions, nearby facilities, and cost
              estimates.
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-sm font-body text-on-surface-variant bg-surface-container-lowest px-4 py-2 rounded-full border-ghost shadow-ambient shrink-0"
            aria-label="Assessment progress"
          >
            <span className="material-symbols-outlined text-secondary text-lg">
              data_loss_prevention
            </span>
            Step {stepIndex} of {initialAssessment?.needs_followup ? 4 : 3}
          </div>
        </header>

        {step === "intake" && (
          plan: manualInsurance.plan,
          provider: manualInsurance.provider,
          memberId: manualInsurance.memberId,
        }
      : {
          plan: insurance,
          provider: insuranceLabel(insurance),
        };
    createSessionMutation.mutate(
      { insurance_details: insuranceDetails },
      {
        onSuccess: () => {
          setStep("results");
        },
        onError: (error) => {
          console.error("Failed to create symptom session:", error);
          // Still proceed to results for now, or handle error
          setStep("results");
        },
      }
    );
  };

  const restart = () => {
    setStep("intake");
    setSymptoms("");
    setInsurance("");
    setManualInsurance({
      provider: "",
      plan: "",
      memberId: "",
    });
    setOnset("");
    setPainRating(5);
  };

  const stepIndex = step === "intake" ? 1 : step === "followup" ? 2 : 3;

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12 pb-16">
      <div className="max-w-6xl mx-auto">
        <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold uppercase tracking-wider mb-4 border border-secondary-fixed-dim/30">
              <span className="material-symbols-outlined text-sm">
                assignment
              </span>
              Guided assessment
            </div>
            <h1 className="text-3xl md:text-5xl font-headline font-extrabold text-primary tracking-tight mb-2">
              Symptom Check
            </h1>
            <p className="text-on-surface-variant font-body text-base max-w-2xl">
              Answer a short questionnaire about what you are experiencing. We
              use your responses to highlight possible next steps, nearby
              facilities, and illustrative price ranges tied to the insurer you
              select—not a personal quote.
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-sm font-body text-on-surface-variant bg-surface-container-lowest px-4 py-2 rounded-full border-ghost shadow-ambient shrink-0"
            aria-label="Assessment progress"
          >
            <span className="material-symbols-outlined text-secondary text-lg">
              data_loss_prevention
            </span>
            Step {stepIndex} of 3
          </div>
        </header>

        {step === "intake" && (
          <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
            <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">
                edit_note
              </span>
              Your symptoms &amp; coverage
            </h2>
            <div className="space-y-8 relative z-10">
              <div>
                <label
                  className="block text-sm font-semibold text-on-surface mb-2"
                  htmlFor="symptoms-detail"
                >
                  Describe your symptoms and what you have been experiencing
                  <span className="text-error ml-1" aria-hidden>
                    *
                  </span>
                </label>
                <textarea
                  className="w-full min-h-[160px] bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner resize-y"
                  id="symptoms-detail"
                  placeholder="Example: sharp pain in the lower right abdomen since last night, worse when walking; mild nausea; no fever measured."
                  value={symptoms}
                  onChange={(e) => setSymptoms(e.target.value)}
                />
                <p className="mt-2 text-xs text-on-surface-variant font-body">
                  Include timing, severity, anything that makes it better or
                  worse, and relevant history if you are comfortable sharing it.
                </p>
              </div>

              <fieldset className="border-0 p-0 m-0">
                <legend className="block text-sm font-semibold text-on-surface mb-3">
                  Insurance provider
                  <span className="text-error ml-1" aria-hidden>
                    *
                  </span>
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {INSURANCE_OPTIONS.map((opt) => {
                    const selected = insurance === opt.id;
                    return (
                      <label
                        key={opt.id}
                        className={`flex items-center gap-3 cursor-pointer rounded-xl border px-4 py-3 transition-colors ${
                          selected
                            ? "border-primary bg-primary-fixed/15 ring-1 ring-primary"
                            : "border-outline-variant/30 bg-surface hover:border-outline-variant/60"
                        }`}
                      >
                        <input
                          checked={selected}
                          className="accent-primary w-4 h-4 shrink-0"
                          name="insurance"
                          type="radio"
                          value={opt.id}
                          onChange={() => setInsurance(opt.id)}
                        />
                        <span className="font-body text-sm text-on-surface font-medium">
                          {opt.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {insurance === "other" && (
                  <div className="mt-4 space-y-4 p-4 bg-surface-container-low rounded-lg border border-outline-variant/20">
                    <h4 className="text-sm font-semibold text-on-surface mb-3">
                      Enter your insurance details
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label
                          className="block text-sm font-medium text-on-surface mb-2"
                          htmlFor="insurance-provider"
                        >
                          Insurance Provider
                          <span className="text-error ml-1" aria-hidden>
                            *
                          </span>
                        </label>
                        <input
                          className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-lg px-3 py-2 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
                          id="insurance-provider"
                          placeholder="e.g., Blue Cross Blue Shield"
                          type="text"
                          value={manualInsurance.provider}
                          onChange={(e) =>
                            setManualInsurance(prev => ({
                              ...prev,
                              provider: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div>
                        <label
                          className="block text-sm font-medium text-on-surface mb-2"
                          htmlFor="insurance-plan"
                        >
                          Plan Name
                        </label>
                        <input
                          className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-lg px-3 py-2 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
                          id="insurance-plan"
                          placeholder="e.g., PPO Plus"
                          type="text"
                          value={manualInsurance.plan}
                          onChange={(e) =>
                            setManualInsurance(prev => ({
                              ...prev,
                              plan: e.target.value,
                            }))
                          }
                        />
                      </div>
                    </div>
                    <div>
                      <label
                        className="block text-sm font-medium text-on-surface mb-2"
                        htmlFor="member-id"
                      >
                        Member ID (optional)
                      </label>
                      <input
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-lg px-3 py-2 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
                        id="member-id"
                        placeholder="Your member identification number"
                        type="text"
                        value={manualInsurance.memberId}
                        onChange={(e) =>
                          setManualInsurance(prev => ({
                            ...prev,
                            memberId: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                )}
              </fieldset>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                <button
                  className="gradient-primary text-on-primary px-8 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={!intakeValid}
                  type="button"
                  onClick={goToFollowUp}
                >
                  Continue
                  <span className="material-symbols-outlined text-lg">
                    arrow_forward
                  </span>
                </button>
                {!intakeValid && (
                  <p className="text-xs text-on-surface-variant font-body">
                    Add a symptom description and choose an insurer to
                    continue.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {step === "followup" && (
          <div className="space-y-6">
            <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5">
                auto_awesome
              </span>
              <div>
                <h3 className="text-sm font-bold text-primary mb-1 font-headline">
                  Follow-up questions
                </h3>
                <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                  Based on what you entered, a few additional questions help
                  narrow timing and severity. (In production this step would be
                  driven by triage rules and your full responses.)
                </p>
              </div>
            </div>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  quiz
                </span>
                Short questionnaire
              </h2>

              <div className="space-y-10">
                <fieldset className="border-0 p-0 m-0">
                  <legend className="text-sm font-semibold text-on-surface mb-3 block">
                    When did these symptoms start?
                    <span className="text-error ml-1" aria-hidden>
                      *
                    </span>
                  </legend>
                  <div className="flex flex-col gap-2">
                    {ONSET_OPTIONS.map((opt) => {
                      const selected = onset === opt.id;
                      return (
                        <label
                          key={opt.id}
                          className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                            selected
                              ? "border-secondary bg-secondary-fixed/10 ring-1 ring-secondary"
                              : "border-outline-variant/25 bg-surface"
                          }`}
                        >
                          <input
                            checked={selected}
                            className="accent-secondary w-4 h-4 shrink-0"
                            name="onset"
                            type="radio"
                            value={opt.id}
                            onChange={() => setOnset(opt.id)}
                          />
                          <span className="font-body text-sm text-on-surface">
                            {opt.label}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>

                <div>
                  <p className="text-sm font-semibold text-on-surface mb-2">
                    If pain or discomfort applies, how severe is it right now?
                  </p>
                  <p className="text-xs text-on-surface-variant mb-4 font-body">
                    1 is barely noticeable; 10 is the worst you can imagine.
                  </p>
                  <div className="bg-surface px-5 py-6 rounded-xl border border-outline-variant/10">
                    <div className="flex justify-between text-xs font-semibold text-primary mb-3 px-1">
                      {Array.from({ length: 10 }, (_, i) => (
                        <span key={i}>{i + 1}</span>
                      ))}
                    </div>
                    <input
                      aria-valuemax={10}
                      aria-valuemin={1}
                      aria-valuenow={painRating}
                      className="w-full"
                      max={10}
                      min={1}
                      type="range"
                      value={painRating}
                      onChange={(e) =>
                        setPainRating(Number(e.target.value))
                      }
                    />
                    <div className="flex justify-between text-xs text-on-surface-variant mt-3 px-1 font-medium">
                      <span>Mild</span>
                      <span>Moderate</span>
                      <span className="text-error font-bold">Severe</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 mt-10 pt-6 border-t border-outline-variant/15">
                <button
                  className="px-6 py-2.5 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors"
                  type="button"
                  onClick={() => setStep("intake")}
                >
                  Back
                </button>
                <button
                  className="gradient-primary text-on-primary px-8 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none sm:ml-auto"
                  disabled={!followUpValid || createSessionMutation.isPending}
                  type="button"
                  onClick={goToResults}
                >
                  {createSessionMutation.isPending ? "Submitting..." : "See results"}
                  <span className="material-symbols-outlined text-lg">
                    {createSessionMutation.isPending ? "sync" : "monitoring"}
                  </span>
                </button>
              </div>
            </section>
          </div>
        )}

        {step === "results" && (
          <div className="space-y-8">
            <div className="bg-error-container/40 border border-error-container/50 rounded-xl p-5 flex gap-3 items-start">
              <span
                className="material-symbols-outlined text-on-error-container shrink-0"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                medical_information
              </span>
              <div>
                <h3 className="font-headline font-bold text-on-surface text-sm mb-1">
                  Not a diagnosis or emergency instruction
                </h3>
                <p className="text-xs sm:text-sm text-on-surface-variant font-body leading-relaxed">
                  The list below illustrates conditions sometimes considered when
                  symptoms like yours are reported. Only a licensed clinician who
                  examines you can diagnose or advise urgency. If you believe you
                  are having an emergency, call 911 or go to the nearest
                  emergency department.
                </p>
              </div>
            </div>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  neurology
                </span>
                Possible conditions (illustrative)
              </h2>
              <ul className="space-y-5">
                {MOCK_DIAGNOSES.map((d) => (
                  <li
                    key={d.title}
                    className="border-b border-outline-variant/10 last:border-0 pb-5 last:pb-0"
                  >
                    <h3 className="font-headline text-base font-bold text-on-surface mb-2">
                      {d.title}
                    </h3>
                    <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                      {d.explanation}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  local_hospital
                </span>
                Nearby hospitals
              </h2>
              <ul className="space-y-4">
                {MOCK_HOSPITALS.map((h) => (
                  <li
                    key={h.name}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface rounded-xl p-4 border border-outline-variant/15"
                  >
                    <div>
                      <p className="font-headline font-bold text-on-surface">
                        {h.name}
                      </p>
                      <p className="text-sm text-on-surface-variant font-body mt-1">
                        {h.address}
                      </p>
                    </div>
                    <div className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-md self-start sm:self-center">
                      <span className="material-symbols-outlined text-base">
                        near_me
                      </span>
                      {h.distance}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">
                  payments
                </span>
                Estimated cost context
              </h2>
              <p className="text-sm text-on-surface-variant font-body mb-6">
                Illustrative ranges for{" "}
                <strong className="text-on-surface">{insurerLabel}</strong> at
                each facility, using the same type of visit as an example.
              </p>
              <div className="space-y-6">
                {MOCK_HOSPITALS.map((h) => (
                  <article
                    key={h.name}
                    className="bg-surface rounded-xl p-5 border border-outline-variant/15"
                  >
                    <h3 className="font-headline text-base font-bold text-on-surface mb-3">
                      {h.name}
                    </h3>
                    {buildCostNarrative(insurerLabel, h)
                      .split("\n\n")
                      .map((para, i) => (
                        <p
                          key={i}
                          className={`text-sm text-on-surface font-body leading-relaxed ${
                            i > 0 ? "mt-3 text-on-surface-variant" : ""
                          }`}
                        >
                          {para}
                        </p>
                      ))}
                  </article>
                ))}
              </div>
            </section>

            <div className="flex flex-wrap gap-3 justify-center">
              <button
                className="gradient-primary text-on-primary px-8 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all"
                type="button"
                onClick={restart}
              >
                Start a new check
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SymptomCheckPage;
