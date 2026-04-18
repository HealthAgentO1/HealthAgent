/**
 * Symptom Check: three-step flow. Steps 2–3 call Django `POST /api/symptom/survey-llm/`
 * via `symptomLlmClient` (JWT on `apiClient`). Hospitals and cost blurbs stay static mocks.
 *
 * Progress is mirrored to `localStorage` (see `symptomCheckSession.ts`) so users can resume
 * after refresh or navigation; in-flight LLM phases are re-requested on "Resume".
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchSymptomSessionResume } from "../api/queries";
import { LinearLoadingBar, useSimulatedProgress } from "../components/LinearLoadingBar";
import type { FollowUpAnswer, FollowUpQuestion, SymptomResultsPayload } from "../symptomCheck/types";
import { parseJsonObjectFromLlm } from "../symptomCheck/parseLlmJson";
import {
  requestConditionAssessment,
  requestFollowUpQuestions,
  type StructuredFollowUpAnswer,
} from "../symptomCheck/symptomLlmClient";
import type { FollowUpQuestionsWithSession } from "../symptomCheck/types";
import {
  validateFollowUpQuestionsPayload,
  validateSymptomResultsPayload,
} from "../symptomCheck/validatePayloads";
import {
  SYMPTOM_CHECK_SESSION_VERSION,
  clearSymptomCheckSession,
  isRecoverableSymptomCheckSession,
  readSymptomCheckSession,
  writeSymptomCheckSession,
  type SymptomCheckPendingRequest,
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

/** Ensures persisted insurer ids still match the current option list. */
function normalizeInsuranceId(id: string): InsuranceId | "" {
  if (id === "") return "";
  const found = INSURANCE_OPTIONS.find((o) => o.id === id);
  return found ? found.id : "";
}

/** Map insurer label from LLM payloads / resume API back to a known option id when possible. */
function insuranceIdFromLabel(label: string): InsuranceId | "" {
  const t = label.trim().toLowerCase();
  if (!t) return "";
  for (const o of INSURANCE_OPTIONS) {
    if (o.label.toLowerCase() === t) return o.id;
  }
  for (const o of INSURANCE_OPTIONS) {
    const ol = o.label.toLowerCase();
    if (t.includes(ol) || ol.includes(t)) return o.id;
  }
  return "";
}

function buildCostNarrative(
  insurerLabel: string,
  hospital: (typeof MOCK_HOSPITALS)[number],
): string {
  const fmt = (n: number) =>
    `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `Based on publicly posted in-network prices for ${insurerLabel} tied to ${hospital.name} for ${hospital.careExample}, many plans show negotiated amounts roughly between ${fmt(hospital.costLow)} and ${fmt(hospital.costHigh)}, with a common midpoint around ${fmt(hospital.costMid)}.\n\nThis is not your personal cost; your deductible/coinsurance can change what you pay.`;
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
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [step, setStep] = useState<FlowStep>("intake");
  const [symptoms, setSymptoms] = useState("");
  const [insurance, setInsurance] = useState<InsuranceId | "">("");
  // Step 2: populated after the first LLM call; keys match `FollowUpQuestion.id`.
  const [followUpQuestions, setFollowUpQuestions] = useState<FollowUpQuestion[]>([]);
  const [followUpAnswers, setFollowUpAnswers] = useState<Record<string, FollowUpAnswer>>({});
  const [results, setResults] = useState<SymptomResultsPayload | null>(null);
  const [llmError, setLlmError] = useState<string | null>(null);
  /** Fades results content in after the LLM response lands. */
  const [resultsEntered, setResultsEntered] = useState(false);
  /** Tracks in-flight LLM phases for UI disable + session resume (see `symptomCheckSession`). */
  const [pendingRequest, setPendingRequest] = useState<SymptomCheckPendingRequest>(null);
  /** Django `SymptomSession.public_id` after follow-up questions; sent with condition assessment. */
  const [surveyBackendSessionId, setSurveyBackendSessionId] = useState<string | null>(null);
  const [urlSessionHydrating, setUrlSessionHydrating] = useState(false);
  const [resumeChatNotice, setResumeChatNotice] = useState(false);

  const followUpMutation = useMutation({
    mutationFn: (vars: { symptoms: string; insuranceLabel: string }): Promise<FollowUpQuestionsWithSession> =>
      requestFollowUpQuestions(vars),
  });

  const resultsMutation = useMutation({
    mutationFn: (vars: {
      symptoms: string;
      insuranceLabel: string;
      followUpAnswers: StructuredFollowUpAnswer[];
      sessionId: string;
    }) => requestConditionAssessment(vars),
  });

  const followUpLoading = followUpMutation.isPending;
  const resultsLoading = resultsMutation.isPending;
  const followUpProgress = useSimulatedProgress(followUpLoading);
  const resultsProgress = useSimulatedProgress(resultsLoading);

  /**
   * `need-choice`: show Resume / Start over until the user picks one (see lazy init below).
   * `ready`: normal operation; state syncs to `localStorage`.
   */
  const [sessionGate, setSessionGate] = useState<"need-choice" | "ready">(() => {
    if (typeof window === "undefined") return "ready";
    const params = new URLSearchParams(window.location.search);
    if (params.get("session")?.trim()) return "ready";
    const snap = readSymptomCheckSession();
    if (snap && isRecoverableSymptomCheckSession(snap)) return "need-choice";
    return "ready";
  });

  /** Deep link from dashboard: `?session=<uuid>` loads server state and skips the local resume modal. */
  useEffect(() => {
    const sid = searchParams.get("session")?.trim();
    if (!sid) return;

    let cancelled = false;
    setSessionGate("ready");
    setUrlSessionHydrating(true);
    setLlmError(null);
    setResumeChatNotice(false);

    void (async () => {
      try {
        clearSymptomCheckSession();
        const data = await fetchSymptomSessionResume(sid);
        if (cancelled) return;

        setSurveyBackendSessionId(sid);
        setSymptoms(data.symptoms ?? "");
        setInsurance(insuranceIdFromLabel(data.insurance_label ?? ""));
        setPendingRequest(null);
        setResultsEntered(false);

        if (data.resume_step === "followup" && data.followup_raw_text) {
          try {
            const parsed = parseJsonObjectFromLlm(data.followup_raw_text);
            const { questions } = validateFollowUpQuestionsPayload(parsed);
            setFollowUpQuestions(questions);
            setFollowUpAnswers(buildInitialAnswers(questions));
            setResults(null);
            setStep("followup");
          } catch {
            setLlmError("Could not restore follow-up questions from this session.");
            setStep("intake");
            setFollowUpQuestions([]);
            setFollowUpAnswers({});
          }
        } else if (data.resume_step === "results" && data.results_raw_text) {
          try {
            const parsed = parseJsonObjectFromLlm(data.results_raw_text);
            const resPayload = validateSymptomResultsPayload(parsed);
            setFollowUpQuestions([]);
            setFollowUpAnswers({});
            setResults(resPayload);
            setStep("results");
          } catch {
            setLlmError("Could not restore results from this session.");
            setStep("intake");
          }
        } else if (data.resume_step === "chat") {
          setFollowUpQuestions([]);
          setFollowUpAnswers({});
          setResults(null);
          setStep("intake");
          setResumeChatNotice(true);
        } else {
          setFollowUpQuestions([]);
          setFollowUpAnswers({});
          setResults(null);
          setStep("intake");
        }

        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("session");
            return next;
          },
          { replace: true },
        );
      } catch (e) {
        if (!cancelled) {
          setLlmError(
            e instanceof Error
              ? e.message
              : "Unable to load this session. Try again from the dashboard.",
          );
          setStep("intake");
        }
      } finally {
        if (!cancelled) setUrlSessionHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [searchParams, setSearchParams]);

  const intakeValid = symptoms.trim().length > 0 && insurance !== "";

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
      const data = await followUpMutation.mutateAsync({
        symptoms: input.symptoms,
        insuranceLabel: input.insuranceLabel,
      });
      setSurveyBackendSessionId(data.session_id);
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
    backendSessionId: string | null;
  }) => {
    if (!followUpAnswersSatisfy(input.questions, input.answers)) {
      setLlmError("Saved answers are incomplete. Please review the questionnaire.");
      return;
    }
    if (!input.backendSessionId) {
      setLlmError(
        "This session is missing server data. Please start a new symptom check from the beginning.",
      );
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

      const payload = await resultsMutation.mutateAsync({
        symptoms: input.symptoms,
        insuranceLabel: input.insuranceLabel,
        followUpAnswers: structured,
        sessionId: input.backendSessionId,
      });
      setResults(payload);
      setStep("results");
      void queryClient.invalidateQueries({ queryKey: ["symptom-sessions"] });
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
      backendSessionId: surveyBackendSessionId,
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
      followUpQuestions,
      followUpAnswers,
      results,
      pendingRequest,
      llmError,
      surveyBackendSessionId,
    };
    writeSymptomCheckSession(snapshot);
  }, [
    sessionGate,
    step,
    symptoms,
    insurance,
    followUpQuestions,
    followUpAnswers,
    results,
    pendingRequest,
    llmError,
    surveyBackendSessionId,
  ]);

  const applySnapshotToState = (snap: SymptomCheckSessionSnapshot) => {
    setStep(snap.step);
    setSymptoms(snap.symptoms);
    setInsurance(normalizeInsuranceId(snap.insurance));
    setFollowUpQuestions(snap.followUpQuestions);
    setFollowUpAnswers(snap.followUpAnswers);
    setResults(snap.results);
    setLlmError(snap.llmError);
    setSurveyBackendSessionId(snap.surveyBackendSessionId);
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
        backendSessionId: snap.surveyBackendSessionId,
      });
    }
  };

  const handleStartOverFromPrompt = () => {
    clearSymptomCheckSession();
    setStep("intake");
    setSymptoms("");
    setInsurance("");
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setResults(null);
    setLlmError(null);
    setPendingRequest(null);
    setSurveyBackendSessionId(null);
    setResumeChatNotice(false);
    setSessionGate("ready");
  };

  const restart = () => {
    clearSymptomCheckSession();
    followUpMutation.reset();
    resultsMutation.reset();
    setStep("intake");
    setSymptoms("");
    setInsurance("");
    setFollowUpQuestions([]);
    setFollowUpAnswers({});
    setResults(null);
    setLlmError(null);
    setPendingRequest(null);
    setSurveyBackendSessionId(null);
    setResumeChatNotice(false);
    setResultsEntered(false);
  };

  useEffect(() => {
    if (!results) {
      setResultsEntered(false);
      return;
    }
    setResultsEntered(false);
    const t = window.setTimeout(() => setResultsEntered(true), 40);
    return () => clearTimeout(t);
  }, [results]);

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
        {urlSessionHydrating ? (
          <div
            aria-busy="true"
            aria-live="polite"
            className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/45 p-6"
          >
            <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            <p className="font-body text-sm font-medium text-on-primary">
              Opening your saved session…
            </p>
          </div>
        ) : null}

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

        {resumeChatNotice && step === "intake" ? (
          <div
            className="mb-8 rounded-xl border border-primary/30 bg-primary-fixed/10 px-4 py-4 md:px-6 md:py-5 flex flex-col sm:flex-row sm:items-center gap-4"
            role="status"
          >
            <div className="flex-1 min-w-0">
              <p className="font-headline text-sm font-bold text-primary mb-1">Conversational session</p>
              <p className="font-body text-sm text-on-surface-variant">
                This entry was created with the live chat interview, not the structured Symptom Check
                questionnaire. You can start a new guided check below whenever you are ready.
              </p>
            </div>
            <button
              className="shrink-0 font-headline text-sm font-semibold text-primary border border-primary/40 rounded-lg px-4 py-2 hover:bg-primary/5 transition-colors"
              type="button"
              onClick={() => setResumeChatNotice(false)}
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {step === "intake" && (
          <section
            className={`bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost relative overflow-hidden transition-opacity duration-300 ease-out ${
              followUpLoading ? "opacity-60 pointer-events-none" : "opacity-100"
            }`}
          >
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
              </fieldset>

              {llmError ? (
                <p className="text-sm text-error font-body" role="alert">
                  {llmError}
                </p>
              ) : null}

              {followUpLoading ? (
                <div
                  className="mt-8 pt-6 border-t border-outline-variant/15 space-y-3 transition-opacity duration-300 ease-out"
                  aria-live="polite"
                >
                  <p className="text-sm font-semibold text-primary font-headline">
                    Generating follow-up questions…
                  </p>
                  <LinearLoadingBar
                    estimatedSeconds={30}
                    label="Generating follow-up questions"
                    progress={followUpProgress}
                  />
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-2">
                <button
                  className="gradient-primary text-on-primary px-8 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:pointer-events-none"
                  disabled={!intakeValid || followUpLoading}
                  type="button"
                  onClick={() => void handleContinueToFollowUp()}
                >
                  {followUpLoading ? "Preparing questions…" : "Continue"}
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </button>
                {!intakeValid && (
                  <p className="text-xs text-on-surface-variant font-body">
                    Add a symptom description and choose an insurer to continue.
                  </p>
                )}
              </div>
            </div>
          </section>
        )}

        {step === "followup" && (
          <div className="space-y-6">
            <div
              className={`bg-surface-container-low rounded-xl p-5 border border-outline-variant/10 flex items-start gap-3 transition-opacity duration-300 ${
                resultsLoading ? "opacity-40" : "opacity-100"
              }`}
            >
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

            <div className="relative">
              <section
                className={`bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost transition-opacity duration-300 ease-out ${
                  resultsLoading ? "opacity-35 pointer-events-none" : "opacity-100"
                }`}
              >
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
                    disabled={!followUpValid || resultsLoading}
                    type="button"
                    onClick={() => void handleSeeResults()}
                  >
                    {resultsLoading ? "Analyzing responses…" : "See results"}
                    <span className="material-symbols-outlined text-lg">monitoring</span>
                  </button>
                </div>
              </section>

              {resultsLoading ? (
                <div
                  className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-surface-container-lowest/92 backdrop-blur-[2px] border border-outline-variant/20 p-5 md:p-8 shadow-ambient transition-opacity duration-300 ease-out"
                  aria-live="polite"
                >
                  <div className="w-full max-w-3xl space-y-3">
                    <p className="text-sm font-semibold text-primary font-headline">
                      Analyzing your responses…
                    </p>
                    <LinearLoadingBar
                      estimatedSeconds={30}
                      label="Analyzing your responses"
                      progress={resultsProgress}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        )}

        {step === "results" && results && (
          <div
            className={`space-y-8 transition-opacity duration-500 ease-out ${
              resultsEntered ? "opacity-100" : "opacity-0"
            }`}
          >
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
              <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">local_hospital</span>
                Nearby hospitals
              </h2>
              <ul className="space-y-4">
                {MOCK_HOSPITALS.map((h) => (
                  <li
                    key={h.name}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-surface rounded-xl p-4 border border-outline-variant/15"
                  >
                    <div>
                      <p className="font-headline font-bold text-on-surface">{h.name}</p>
                      <p className="text-sm text-on-surface-variant font-body mt-1">{h.address}</p>
                    </div>
                    <div className="inline-flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-3 py-1.5 rounded-md self-start sm:self-center">
                      <span className="material-symbols-outlined text-base">near_me</span>
                      {h.distance}
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border-ghost">
              <h2 className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary">payments</span>
                Estimated cost context
              </h2>
              <p className="text-sm text-on-surface-variant font-body mb-6">
                Illustrative ranges for{" "}
                <strong className="text-on-surface">{insurerLabel}</strong> at each facility, using
                the same type of visit as an example.
              </p>
              <div className="space-y-6">
                {MOCK_HOSPITALS.map((h) => (
                  <article
                    key={h.name}
                    className="bg-surface rounded-xl p-5 border border-outline-variant/15"
                  >
                    <h3 className="font-headline text-base font-bold text-on-surface mb-3">{h.name}</h3>
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
