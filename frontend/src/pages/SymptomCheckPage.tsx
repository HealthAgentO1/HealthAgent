/**
 * Symptom Check: three-step flow. Steps 2–3 call Django `POST /api/symptom/survey-llm/`
 * via `symptomLlmClient` (JWT on `apiClient`). Step 3 loads nearby facilities from
 * `POST /api/symptom/nearby-facilities/` (NPPES + Census geocoding via Django).
 *
 * Progress is mirrored to `localStorage` (see `symptomCheckSession.ts`) so users can resume
 * after refresh or navigation; in-flight LLM phases are re-requested on "Resume".
 */
import React, { useEffect, useMemo, useState } from "react";
import type { FollowUpAnswer, FollowUpQuestion, SymptomResultsPayload } from "../symptomCheck/types";
import { validateUserAddress, type UserAddress } from "../symptomCheck/addressValidation";
import {
  buildGoogleMapsUrl,
  requestNearbyFacilities,
  type NearbyFacility,
} from "../symptomCheck/nppesFacilitiesClient";
import { US_STATE_OPTIONS, type UsStateCode } from "../symptomCheck/usStates";
import {
  requestConditionAssessment,
  requestFollowUpQuestions,
} from "../symptomCheck/symptomLlmClient";
import {
  SYMPTOM_CHECK_SESSION_VERSION,
  clearSymptomCheckSession,
  isRecoverableSymptomCheckSession,
  readSymptomCheckSession,
  writeSymptomCheckSession,
  type SymptomCheckSessionSnapshot,
} from "../symptomCheck/symptomCheckSession";

type FlowStep = "intake" | "followup" | "results";

const INSURANCE_OPTIONS = [
  { id: "united", label: "United Healthcare" },
  { id: "elevance", label: "Elevance" },
  { id: "aetna", label: "Aetna" },
  { id: "centene", label: "Centene" },
] as const;

type InsuranceId = (typeof INSURANCE_OPTIONS)[number]["id"];

/** Which address inputs have been blurred; errors show only after blur if still invalid. */
type AddressFieldKey = "street" | "city" | "state" | "postalCode";

const INITIAL_ADDRESS_BLURRED: Record<AddressFieldKey, boolean> = {
  street: false,
  city: false,
  state: false,
  postalCode: false,
};

function insuranceLabel(id: InsuranceId): string {
  return INSURANCE_OPTIONS.find((o) => o.id === id)?.label ?? id;
}

/** Ensures persisted insurer ids still match the current option list. */
function normalizeInsuranceId(id: string): InsuranceId | "" {
  if (id === "") return "";
  const found = INSURANCE_OPTIONS.find((o) => o.id === id);
  return found ? found.id : "";
}

/** Illustrative cost copy is not tied to specific facilities until billing integration lands. */
function buildGenericCostNarrative(insurerLabel: string): string {
  return `Based on publicly posted in-network prices for ${insurerLabel}, negotiated amounts vary widely by facility, procedure code, and plan design. This is not your personal cost; your deductible and coinsurance can change what you pay.\n\nFacility-specific price examples are not shown in this preview.`;
}

/** Buckets Django `relevance_score` (NPI registry heuristics; public reviews are not available there). */
function facilityListingFitLabel(score: number): string {
  if (score >= 10) return "Stronger directory match (name & facility type)";
  if (score >= 5) return "Typical facility listing";
  return "Weaker directory signals — confirm before visiting";
}

/** Default control values so required validation and sliders start in a defined state. */
function buildInitialAnswers(questions: FollowUpQuestion[]): Record<string, FollowUpAnswer> {
  const out: Record<string, FollowUpAnswer> = {};
  for (const q of questions) {
    if (q.input_type === "multi_choice") {
      out[q.id] = [];
    } else if (q.input_type === "scale_1_10") {
      const min = q.scale_min ?? 1;
      out[q.id] = min;
    } else if (q.input_type === "text") {
      out[q.id] = "";
    } else {
      out[q.id] = "";
    }
  }
  return out;
}

/** Mirrors required flags from the LLM question list (optional questions can stay empty). */
function followUpAnswersSatisfy(
  questions: FollowUpQuestion[],
  answers: Record<string, FollowUpAnswer>,
): boolean {
  for (const q of questions) {
    if (!q.required) continue;
    const v = answers[q.id];
    if (q.input_type === "single_choice") {
      if (typeof v !== "string" || v.trim() === "") return false;
    } else if (q.input_type === "text") {
      if (typeof v !== "string" || v.trim() === "") return false;
    } else if (q.input_type === "multi_choice") {
      if (!Array.isArray(v) || v.length === 0) return false;
    } else if (q.input_type === "scale_1_10") {
      if (typeof v !== "number" || !Number.isFinite(v)) return false;
    }
  }
  return true;
}

/** Tailwind bundles for overall / per-condition severity chips (mild | moderate | severe). */
function severityStyles(level: string): string {
  if (level === "severe") {
    return "bg-error-container/40 text-on-error-container border border-error-container/50";
  }
  if (level === "moderate") {
    return "bg-tertiary-container/50 text-on-tertiary-container border border-tertiary-container/40";
  }
  return "bg-primary-fixed/15 text-primary border border-primary-fixed-dim/40";
}

const SymptomCheckPage: React.FC = () => {
  const [step, setStep] = useState<FlowStep>("intake");
  const [symptoms, setSymptoms] = useState("");
  const [insurance, setInsurance] = useState<InsuranceId | "">("");
  /** Step 1: practice location for NPPES distance ranking (mirrored to `symptomCheckSession`). */
  const [userAddress, setUserAddress] = useState<UserAddress>({
    street: "",
    city: "",
    state: "",
    postalCode: "",
  });
  const [addressFieldBlurred, setAddressFieldBlurred] =
    useState<Record<AddressFieldKey, boolean>>(INITIAL_ADDRESS_BLURRED);
  // Step 2: populated after the first LLM call; keys match `FollowUpQuestion.id`.
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, FollowUpAnswer>>({});
  const [results, setResults] = useState<SymptomResultsPayload | null>(null);
  // Serializes Continue / See results while `requestFollowUpQuestions` or `requestConditionAssessment` runs.
  const [pendingRequest, setPendingRequest] = useState<null | "followup" | "results">(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  /** Step 3: NPPES-backed facilities (sorted nearest-first on the server). */
  const [nearbyFacilities, setNearbyFacilities] = useState<NearbyFacility[] | null>(null);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState<string | null>(null);
  const [nearbyTaxonomyUsed, setNearbyTaxonomyUsed] = useState<string | null>(null);

  /**
   * `need-choice`: show Resume / Start over until the user picks one (see lazy init below).
   * `ready`: normal operation; state syncs to `localStorage`.
   */
  const [sessionGate, setSessionGate] = useState<"need-choice" | "ready">(() => {
    if (typeof window === "undefined") return "ready";
    const snap = readSymptomCheckSession();
    if (snap && isRecoverableSymptomCheckSession(snap)) return "need-choice";
    return "ready";
  });

  const addressValidation = useMemo(() => validateUserAddress(userAddress), [userAddress]);
  const intakeValid =
    symptoms.trim().length > 0 && insurance !== "" && addressValidation.valid;

  const followUpValid = followUpAnswersSatisfy(followUpQuestions, followUpAnswers);

  const insurerLabel = useMemo(
    () => (insurance ? insuranceLabel(insurance) : ""),
    [insurance],
  );

  /** First LLM call (intake → follow-up questions). Params allow resume without relying on async state. */
  const runFollowUpRequest = async (input: { symptoms: string; insuranceLabel: string }) => {
    setLlmError(null);
    setPendingRequest("followup");
    try {
      const data = await requestFollowUpQuestions({
        symptoms: input.symptoms,
        insuranceLabel: input.insuranceLabel,
      });
      setFollowUpQuestions(data.questions);
      setFollowUpAnswers(buildInitialAnswers(data.questions));
      setResults(null);
      setStep("followup");
    } catch (err) {
      setLlmError(err instanceof Error ? err.message : "Unable to load follow-up questions.");
    } finally {
      setPendingRequest(null);
    }
  };

  /** Second LLM call (follow-up → results). Accepts explicit `questions` / `answers` for resume. */
  const runResultsRequest = async (input: {
    symptoms: string;
    insuranceLabel: string;
    questions: FollowUpQuestion[];
    answers: Record<string, FollowUpAnswer>;
  }) => {
    if (!followUpAnswersSatisfy(input.questions, input.answers)) {
      setLlmError("Saved answers are incomplete. Please review the questionnaire.");
      return;
    }
    setLlmError(null);
    setPendingRequest("results");
    try {
      const structured = input.questions.map((q) => ({
        question_id: q.id,
        question_prompt: q.prompt,
        input_type: q.input_type,
        value: input.answers[q.id] ?? (q.input_type === "multi_choice" ? [] : ""),
      }));

      const payload = await requestConditionAssessment({
        symptoms: input.symptoms,
        insuranceLabel: input.insuranceLabel,
        followUpAnswers: structured,
      });
      setResults(payload);
      setStep("results");
    } catch (err) {
      setLlmError(err instanceof Error ? err.message : "Unable to load assessment results.");
    } finally {
      setPendingRequest(null);
    }
  };

  /** Step 1 → 2: first LLM request; on success we render dynamic questions. */
  const handleContinueToFollowUp = async () => {
    if (!intakeValid || pendingRequest) return;
    await runFollowUpRequest({
      symptoms: symptoms.trim(),
      insuranceLabel: insurerLabel,
    });
  };

  /** Step 2 → 3: second LLM request includes prompts + values for traceability in `user_payload`. */
  const handleSeeResults = async () => {
    if (!followUpValid || pendingRequest) return;
    await runResultsRequest({
      symptoms: symptoms.trim(),
      insuranceLabel: insurerLabel,
      questions: followUpQuestions,
      answers: followUpAnswers,
    });
  };

  // Mirror flow state to localStorage whenever the user is past the resume gate.
  useEffect(() => {
    if (sessionGate !== "ready") return;

    const snapshot: SymptomCheckSessionSnapshot = {
      version: SYMPTOM_CHECK_SESSION_VERSION,
      updatedAt: new Date().toISOString(),
      step,
      symptoms,
      insurance,
      address: {
        street: userAddress.street,
        city: userAddress.city,
        state: userAddress.state,
        postalCode: userAddress.postalCode,
      },
      followUpQuestions,
      followUpAnswers,
      results,
      pendingRequest,
      llmError,
    };
    writeSymptomCheckSession(snapshot);
  }, [
    sessionGate,
    step,
    symptoms,
    insurance,
    userAddress,
    followUpQuestions,
    followUpAnswers,
    results,
    pendingRequest,
    llmError,
  ]);

  /** After the LLM returns `care_taxonomy`, ask Django to rank NPPES facilities by road distance (via geocoding). */
  useEffect(() => {
    if (step !== "results") {
      setNearbyFacilities(null);
      setNearbyError(null);
      setNearbyTaxonomyUsed(null);
      setNearbyLoading(false);
      return;
    }
    if (!results) return;

    if (!addressValidation.valid) {
      setNearbyFacilities(null);
      setNearbyTaxonomyUsed(null);
      setNearbyError(
        "Add a valid US address on step 1 to see nearby facilities. Go back to the first step, enter your address, then continue.",
      );
      setNearbyLoading(false);
      return;
    }

    let cancelled = false;
    setNearbyLoading(true);
    setNearbyError(null);
    setNearbyFacilities(null);
    setNearbyTaxonomyUsed(null);

    const run = async () => {
      try {
        const payload = await requestNearbyFacilities({
          street: userAddress.street.trim(),
          city: userAddress.city.trim(),
          state: userAddress.state,
          postal_code: userAddress.postalCode.trim(),
          taxonomy_codes: results.care_taxonomy.taxonomy_codes,
          suggested_care_setting: results.care_taxonomy.suggested_care_setting,
        });
        if (cancelled) return;
        setNearbyFacilities(payload.facilities);
        setNearbyTaxonomyUsed(payload.taxonomy_used);
      } catch (e) {
        if (cancelled) return;
        setNearbyFacilities(null);
        setNearbyError(e instanceof Error ? e.message : "Unable to load nearby facilities.");
      } finally {
        if (!cancelled) setNearbyLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [
    step,
    results,
    addressValidation.valid,
    userAddress.street,
    userAddress.city,
    userAddress.state,
    userAddress.postalCode,
  ]);

  const applySnapshotToState = (snap: SymptomCheckSessionSnapshot) => {
    setStep(snap.step);
    setSymptoms(snap.symptoms);
    setInsurance(normalizeInsuranceId(snap.insurance));
    setUserAddress({
      street: snap.address.street,
      city: snap.address.city,
      state: (snap.address.state as UsStateCode | "") || "",
      postalCode: snap.address.postalCode,
    });
    setAddressFieldBlurred(INITIAL_ADDRESS_BLURRED);
    setFollowUpQuestions(snap.followUpQuestions);
    setFollowUpAnswers(snap.followUpAnswers);
    setResults(snap.results);
    setLlmError(snap.llmError);
    setPendingRequest(null);
  };

  /** Restore saved answers and optionally replay the in-flight LLM call from the saved phase. */
  const handleResumeSession = () => {
    const snap = readSymptomCheckSession();
    if (!snap) {
      setSessionGate("ready");
      return;
    }
    applySnapshotToState(snap);
    setSessionGate("ready");

    const ins = normalizeInsuranceId(snap.insurance);
    const label = ins ? insuranceLabel(ins) : "";
    const trimmed = snap.symptoms.trim();

    if (snap.pendingRequest === "followup") {
      if (trimmed.length === 0 || !ins) return;
      void runFollowUpRequest({ symptoms: trimmed, insuranceLabel: label });
    } else if (snap.pendingRequest === "results") {
      if (trimmed.length === 0 || !ins) return;
      if (snap.followUpQuestions.length === 0) return;
      void runResultsRequest({
        symptoms: trimmed,
        insuranceLabel: label,
        questions: snap.followUpQuestions,
        answers: snap.followUpAnswers,
      });
    }
  };

  const handleStartOverFromPrompt = () => {
    clearSymptomCheckSession();
    setStep("intake");
    setSymptoms("");
    setInsurance("");
    setUserAddress({ street: "", city: "", state: "", postalCode: "" });
    setAddressFieldBlurred(INITIAL_ADDRESS_BLURRED);
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setResults(null);
    setLlmError(null);
    setPendingRequest(null);
    setSessionGate("ready");
  };

  const restart = () => {
    clearSymptomCheckSession();
    setStep("intake");
    setSymptoms("");
    setInsurance("");
    setUserAddress({ street: "", city: "", state: "", postalCode: "" });
    setAddressFieldBlurred(INITIAL_ADDRESS_BLURRED);
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setResults(null);
    setLlmError(null);
    setPendingRequest(null);
  };

  const stepIndex = step === "intake" ? 1 : step === "followup" ? 2 : 3;

  const updateAnswer = (questionId: string, value: FollowUpAnswer) => {
    setFollowUpAnswers((prev) => ({ ...prev, [questionId]: value }));
  };

  /**
   * LLM may emit a `none` option id (see mock in `symptomLlmClient`); selecting it clears
   * other chips so “none of the above” stays mutually exclusive with other symptoms.
   */
  const toggleMultiChoice = (question: FollowUpQuestion, optionId: string) => {
    const current = followUpAnswers[question.id];
    const selected = Array.isArray(current) ? [...current] : [];
    const isNone = optionId === "none";

    let next: string[];
    if (isNone) {
      next = selected.includes("none") ? [] : ["none"];
    } else {
      const withoutNone = selected.filter((id) => id !== "none");
      if (withoutNone.includes(optionId)) {
        next = withoutNone.filter((id) => id !== optionId);
      } else {
        next = [...withoutNone, optionId];
      }
    }

    updateAnswer(question.id, next);
  };

  /** Maps each `input_type` from the LLM to the same control patterns as the old static step. */
  const renderFollowUpQuestion = (q: FollowUpQuestion) => {
    const value = followUpAnswers[q.id];

    if (q.input_type === "single_choice" && q.options) {
      return (
        <fieldset className="border-0 p-0 m-0" key={q.id}>
          <legend className="text-sm font-semibold text-on-surface mb-3 block">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </legend>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-3">{q.helper_text}</p>
          ) : null}
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const selected = value === opt.id;
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
                    name={q.id}
                    type="radio"
                    value={opt.id}
                    onChange={() => updateAnswer(q.id, opt.id)}
                  />
                  <span className="font-body text-sm text-on-surface">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    if (q.input_type === "multi_choice" && q.options) {
      const selected = Array.isArray(value) ? value : [];
      return (
        <fieldset className="border-0 p-0 m-0" key={q.id}>
          <legend className="text-sm font-semibold text-on-surface mb-3 block">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </legend>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-3">{q.helper_text}</p>
          ) : null}
          <div className="flex flex-col gap-2">
            {q.options.map((opt) => {
              const checked = selected.includes(opt.id);
              return (
                <label
                  key={opt.id}
                  className={`flex items-center gap-3 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
                    checked
                      ? "border-secondary bg-secondary-fixed/10 ring-1 ring-secondary"
                      : "border-outline-variant/25 bg-surface"
                  }`}
                >
                  <input
                    checked={checked}
                    className="accent-secondary w-4 h-4 shrink-0"
                    type="checkbox"
                    onChange={() => toggleMultiChoice(q, opt.id)}
                  />
                  <span className="font-body text-sm text-on-surface">{opt.label}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    }

    if (q.input_type === "text") {
      const textVal = typeof value === "string" ? value : "";
      return (
        <div key={q.id}>
          <label
            className="block text-sm font-semibold text-on-surface mb-2"
            htmlFor={`followup-${q.id}`}
          >
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </label>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant font-body mb-2">{q.helper_text}</p>
          ) : null}
          <textarea
            className="w-full min-h-[120px] bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body leading-relaxed focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner resize-y"
            id={`followup-${q.id}`}
            value={textVal}
            onChange={(e) => updateAnswer(q.id, e.target.value)}
          />
        </div>
      );
    }

    if (q.input_type === "scale_1_10") {
      const min = q.scale_min ?? 1;
      const max = q.scale_max ?? 10;
      const numeric = typeof value === "number" && Number.isFinite(value) ? value : min;
      const ticks = Array.from({ length: max - min + 1 }, (_, i) => min + i);
      return (
        <div key={q.id}>
          <p className="text-sm font-semibold text-on-surface mb-2">
            {q.prompt}
            {q.required ? (
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            ) : null}
          </p>
          {q.helper_text ? (
            <p className="text-xs text-on-surface-variant mb-4 font-body">{q.helper_text}</p>
          ) : null}
          <div className="bg-surface px-5 py-6 rounded-xl border border-outline-variant/10">
            <div className="flex justify-between text-xs font-semibold text-primary mb-3 px-1 gap-1 overflow-x-auto">
              {ticks.map((t) => (
                <span key={t} className="shrink-0">
                  {t}
                </span>
              ))}
            </div>
            <input
              aria-valuemax={max}
              aria-valuemin={min}
              aria-valuenow={numeric}
              className="w-full"
              max={max}
              min={min}
              type="range"
              value={numeric}
              onChange={(e) => updateAnswer(q.id, Number(e.target.value))}
            />
            <div className="flex justify-between text-xs text-on-surface-variant mt-3 px-1 font-medium">
              <span>{q.scale_min_label ?? "Low"}</span>
              <span className="text-on-surface font-semibold">{numeric}</span>
              <span className="text-error font-bold">{q.scale_max_label ?? "High"}</span>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12 pb-16">
      <div className="max-w-6xl mx-auto relative">
        {sessionGate === "need-choice" ? (
          <div
            aria-labelledby="symptom-session-resume-title"
            aria-modal="true"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
            role="dialog"
          >
            <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-md w-full p-6 md:p-8 border border-outline-variant/20">
              <h2
                className="text-xl font-headline font-bold text-primary mb-2"
                id="symptom-session-resume-title"
              >
                Resume your symptom check?
              </h2>
              <p className="text-sm text-on-surface-variant font-body leading-relaxed mb-6">
                We saved your progress in this browser. You can continue where you left off, or start
                over. If a question step was loading when you left, we will request it again when you
                resume.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <button
                  className="gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 sm:flex-1"
                  type="button"
                  onClick={handleResumeSession}
                >
                  Resume
                  <span className="material-symbols-outlined text-lg">play_arrow</span>
                </button>
                <button
                  className="px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                  type="button"
                  onClick={handleStartOverFromPrompt}
                >
                  Start over
                </button>
              </div>
            </div>
          </div>
        ) : null}

        <header className="mb-10 flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold uppercase tracking-wider mb-4 border border-secondary-fixed-dim/30">
              <span className="material-symbols-outlined text-sm">assignment</span>
              Guided assessment
            </div>
            <h1 className="text-3xl md:text-5xl font-headline font-extrabold text-primary tracking-tight mb-2">
              Symptom Check
            </h1>
            <p className="text-on-surface-variant font-body text-base max-w-2xl">
              Answer a short questionnaire about what you are experiencing. We use your responses
              to highlight possible next steps, nearby facilities, and illustrative price ranges tied
              to the insurer you select—not a personal quote.
            </p>
          </div>
          <div
            className="flex items-center gap-2 text-sm font-body text-on-surface-variant bg-surface-container-lowest px-4 py-2 rounded-full border-ghost shadow-ambient shrink-0"
            aria-label="Assessment progress"
          >
            <span className="material-symbols-outlined text-secondary text-lg">data_loss_prevention</span>
            Step {stepIndex} of 3
          </div>
        </header>

        {step === "intake" && (
          <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost relative overflow-hidden">
            <div className="absolute -top-12 -right-12 w-40 h-40 bg-primary/5 rounded-full blur-2xl pointer-events-none" />
            <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">edit_note</span>
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
                  Include timing, severity, anything that makes it better or worse, and relevant
                  history if you are comfortable sharing it.
                </p>
              </div>

              <fieldset className="border-0 p-0 mx-0 mb-0">
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
              </fieldset>

              <div className="pt-10 mt-2 border-t border-outline-variant/15">
                <fieldset className="border-0 p-0 mx-0 mb-0">
                  <legend className="block text-sm font-semibold text-on-surface mb-2">
                    Current address
                    <span className="text-error ml-1" aria-hidden>
                      *
                    </span>
                  </legend>
                  <p className="text-xs text-on-surface-variant font-body mb-4">
                    Used to rank nearby facilities for your situation. US addresses only (NPPES directory).
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="md:col-span-2">
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-street"
                      >
                        Street address
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <input
                        aria-invalid={
                          addressFieldBlurred.street && Boolean(addressValidation.errors.street)
                        }
                        autoComplete="street-address"
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner"
                        id="addr-street"
                        placeholder="123 Main St, Apt 4"
                        type="text"
                        value={userAddress.street}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, street: true }))
                        }
                        onChange={(e) =>
                          setUserAddress((prev) => ({ ...prev, street: e.target.value }))
                        }
                      />
                      {addressFieldBlurred.street && addressValidation.errors.street ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.street}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-city"
                      >
                        City
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <input
                        aria-invalid={
                          addressFieldBlurred.city && Boolean(addressValidation.errors.city)
                        }
                        autoComplete="address-level2"
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner"
                        id="addr-city"
                        placeholder="City"
                        type="text"
                        value={userAddress.city}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, city: true }))
                        }
                        onChange={(e) =>
                          setUserAddress((prev) => ({ ...prev, city: e.target.value }))
                        }
                      />
                      {addressFieldBlurred.city && addressValidation.errors.city ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.city}
                        </p>
                      ) : null}
                    </div>

                    <div>
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-state"
                      >
                        State
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <select
                        aria-invalid={
                          addressFieldBlurred.state && Boolean(addressValidation.errors.state)
                        }
                        className="w-full bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary shadow-inner"
                        id="addr-state"
                        value={userAddress.state}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, state: true }))
                        }
                        onChange={(e) =>
                          setUserAddress((prev) => ({
                            ...prev,
                            state: e.target.value as UsStateCode | "",
                          }))
                        }
                      >
                        <option value="">Select state</option>
                        {US_STATE_OPTIONS.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      {addressFieldBlurred.state && addressValidation.errors.state ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.state}
                        </p>
                      ) : null}
                    </div>

                    <div className="md:col-span-2">
                      <label
                        className="block text-sm font-semibold text-on-surface mb-2"
                        htmlFor="addr-zip"
                      >
                        ZIP code
                        <span className="text-error ml-1" aria-hidden>
                          *
                        </span>
                      </label>
                      <input
                        aria-invalid={
                          addressFieldBlurred.postalCode &&
                          Boolean(addressValidation.errors.postalCode)
                        }
                        inputMode="numeric"
                        autoComplete="postal-code"
                        className="w-full max-w-xs bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-xl px-4 py-3 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50 shadow-inner"
                        id="addr-zip"
                        maxLength={5}
                        placeholder="12345"
                        type="text"
                        value={userAddress.postalCode}
                        onBlur={() =>
                          setAddressFieldBlurred((prev) => ({ ...prev, postalCode: true }))
                        }
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                          setUserAddress((prev) => ({ ...prev, postalCode: v }));
                        }}
                      />
                      {addressFieldBlurred.postalCode && addressValidation.errors.postalCode ? (
                        <p className="mt-1 text-xs text-error font-body" role="alert">
                          {addressValidation.errors.postalCode}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </fieldset>
              </div>

              {llmError ? (
                <p className="text-sm text-error font-body" role="alert">
                  {llmError}
                </p>
              ) : null}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                <button
                  className="gradient-primary text-on-primary px-8 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={!intakeValid || pendingRequest !== null}
                  type="button"
                  onClick={() => void handleContinueToFollowUp()}
                >
                  {pendingRequest === "followup" ? "Preparing questions…" : "Continue"}
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
                {!intakeValid && (
                  <p className="text-xs text-on-surface-variant font-body">
                    Add symptoms, choose an insurer, and complete your address to continue.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {step === "followup" && (
          <div className="space-y-6">
            <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5">auto_awesome</span>
              <div>
                <h3 className="text-sm font-bold text-primary mb-1 font-headline">Follow-up questions</h3>
                <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                  These questions were generated from your symptom description to mirror what a
                  clinician might ask next. Your answers refine the illustrative assessment shown in
                  the results step.
                </p>
              </div>
            </div>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">quiz</span>
                Short questionnaire
              </h2>

              <div className="space-y-10">
                {followUpQuestions.map((question) => renderFollowUpQuestion(question))}
              </div>

              {llmError ? (
                <p className="mt-8 text-sm text-error font-body" role="alert">
                  {llmError}
                </p>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-3 mt-10 pt-6 border-t border-outline-variant/15">
                <button
                  className="px-6 py-2.5 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors"
                  type="button"
                  onClick={() => {
                    setStep("intake");
                    setFollowUpQuestions([]);
                    setFollowUpAnswers({});
                    setLlmError(null);
                  }}
                >
                  Back
                </button>
                <button
                  className="gradient-primary text-on-primary px-8 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none sm:ml-auto"
                  disabled={!followUpValid || pendingRequest !== null}
                  type="button"
                  onClick={() => void handleSeeResults()}
                >
                  {pendingRequest === "results" ? "Analyzing responses…" : "See results"}
                  <span className="material-symbols-outlined text-lg">monitoring</span>
                </button>
              </div>
            </section>
          </div>
        )}

        {step === "results" && results && (
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
                  The list below illustrates conditions sometimes considered when symptoms like
                  yours are reported. Only a licensed clinician who examines you can diagnose or
                  advise urgency. If you believe you are having an emergency, call 911 or go to the
                  nearest emergency department.
                </p>
              </div>
            </div>

            <div
              className={`rounded-xl px-5 py-4 flex flex-wrap items-center gap-3 border font-body text-sm ${severityStyles(results.overall_patient_severity)}`}
            >
              <span className="material-symbols-outlined text-xl">monitor_heart</span>
              <div>
                <p className="font-headline font-bold text-on-surface text-sm">
                  Overall reported acuity (illustrative)
                </p>
                <p className="text-on-surface-variant capitalize">
                  {results.overall_patient_severity}
                </p>
              </div>
            </div>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">neurology</span>
                Possible conditions (illustrative)
              </h2>
              <ul className="space-y-5">
                {results.conditions.map((d) => (
                  <li
                    key={d.title}
                    className="border-b border-outline-variant/10 last:border-0 pb-5 last:pb-0"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
                      <h3 className="font-headline text-base font-bold text-on-surface">{d.title}</h3>
                      <span
                        className={`text-xs font-bold uppercase tracking-wide px-3 py-1 rounded-full border shrink-0 ${severityStyles(d.condition_severity)}`}
                      >
                        {d.condition_severity}
                      </span>
                    </div>
                    <p className="text-sm text-on-surface-variant font-body leading-relaxed">
                      {d.explanation}
                    </p>
                    <p className="text-sm text-on-surface font-body leading-relaxed mt-3">
                      <span className="font-semibold text-primary">Why this is on the list: </span>
                      {d.why_possible}
                    </p>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">local_hospital</span>
                Nearby hospitals
              </h2>
              <p className="text-xs text-on-surface-variant font-body mb-3 leading-relaxed">
                Order is <strong className="text-on-surface">relevance-aware</strong>: we combine
                straight-line distance with a heuristic score from the public NPI directory (name
                keywords, facility type, and multi-site signals). Patient reviews are{" "}
                <strong className="text-on-surface">not</strong> in that registry—so farther
                listings can rank higher when they look like established care sites.
              </p>
              {nearbyTaxonomyUsed ? (
                <p className="text-xs text-on-surface-variant font-body mb-4">
                  Directory search used NUCC taxonomy code{" "}
                  <span className="font-mono text-on-surface">{nearbyTaxonomyUsed}</span> from your
                  assessment.
                </p>
              ) : null}

              {nearbyLoading ? (
                <p className="text-sm text-on-surface-variant font-body">Loading nearby facilities…</p>
              ) : null}

              {nearbyError ? (
                <p className="text-sm text-error font-body" role="alert">
                  {nearbyError}
                </p>
              ) : null}

              {!nearbyLoading && !nearbyError && nearbyFacilities && nearbyFacilities.length === 0 ? (
                <p className="text-sm text-on-surface-variant font-body">
                  No facilities matched this search. Try adjusting your ZIP or try again later.
                </p>
              ) : null}

              {!nearbyLoading && !nearbyError && nearbyFacilities && nearbyFacilities.length > 0 ? (
                <div className="space-y-4">
                  <ul className="space-y-4">
                    {nearbyFacilities.slice(0, 3).map((h) => (
                      <li
                        key={h.npi}
                        className="flex flex-col gap-3 bg-surface rounded-xl p-4 border border-outline-variant/15"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                          <div>
                            <p className="font-headline font-bold text-on-surface">{h.name}</p>
                            <p className="text-sm text-on-surface-variant font-body mt-1">
                              {h.address_line}
                            </p>
                            <p className="text-xs text-on-surface-variant/85 font-body mt-1">
                              {facilityListingFitLabel(h.relevance_score)}
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                            <span className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-md">
                              <span className="material-symbols-outlined text-base">near_me</span>
                              {h.distance_label}
                            </span>
                            <a
                              className="inline-flex items-center gap-1 text-sm font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5 hover:bg-primary-fixed/10 transition-colors"
                              href={buildGoogleMapsUrl(h.address_line)}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span className="material-symbols-outlined text-base">map</span>
                              Maps
                            </a>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>

                  {nearbyFacilities.length > 3 ? (
                    <details className="rounded-xl border border-outline-variant/15 bg-surface px-4 py-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary font-headline">
                        Show more facilities ({nearbyFacilities.length - 3} more)
                      </summary>
                      <ul className="mt-4 space-y-4">
                        {nearbyFacilities.slice(3).map((h) => (
                          <li
                            key={h.npi}
                            className="flex flex-col gap-3 border-t border-outline-variant/10 pt-4 first:border-t-0 first:pt-0"
                          >
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div>
                                <p className="font-headline font-bold text-on-surface">{h.name}</p>
                                <p className="text-sm text-on-surface-variant font-body mt-1">
                                  {h.address_line}
                                </p>
                                <p className="text-xs text-on-surface-variant/85 font-body mt-1">
                                  {facilityListingFitLabel(h.relevance_score)}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                                <span className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-md">
                                  <span className="material-symbols-outlined text-base">near_me</span>
                                  {h.distance_label}
                                </span>
                                <a
                                  className="inline-flex items-center gap-1 text-sm font-semibold text-primary border border-primary/30 rounded-md px-3 py-1.5 hover:bg-primary-fixed/10 transition-colors"
                                  href={buildGoogleMapsUrl(h.address_line)}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  <span className="material-symbols-outlined text-base">map</span>
                                  Maps
                                </a>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">payments</span>
                Estimated cost context
              </h2>
              <p className="text-sm text-on-surface-variant font-body mb-6">
                Illustrative guidance for <strong className="text-on-surface">{insurerLabel}</strong>{" "}
                — not tied to the facilities listed above until billing integration is enabled.
              </p>
              <article className="bg-surface rounded-xl p-5 border border-outline-variant/15">
                {buildGenericCostNarrative(insurerLabel)
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
