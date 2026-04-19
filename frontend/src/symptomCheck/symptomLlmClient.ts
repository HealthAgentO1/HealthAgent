/**
 * Symptom Check LLM: POSTs `{ phase, system_prompt, user_payload }` to Django
 * `POST /api/symptom/survey-llm/`, then parses and validates JSON from `raw_text`.
 *
 * System prompts are bundled from `prompts/*.txt` (Vite `?raw`). API keys stay on the server.
 * Requires a JWT (`apiClient`); unauthenticated users get a clear error from the handler.
 * Nearby NPPES lookup is handled separately in `nppesFacilitiesClient.ts` (not this module).
 */
import axios from "axios";
import followupContext from "./prompts/followup_context.txt?raw";
import followupRound2Context from "./prompts/followup_round2_context.txt?raw";
import priceEstimateContext from "./prompts/price_estimate_context.txt?raw";
import resultsContext from "./prompts/results_context.txt?raw";
import { apiClient } from "../api/client";
import { loadActiveRegimen } from "../medicationSafety/medicationRegimenStorage";
import { parseJsonObjectFromLlm } from "./parseLlmJson";
import {
  validateFollowUpQuestionsPayload,
  validatePriceEstimatePayload,
  validateSymptomResultsPayload,
} from "./validatePayloads";
import type {
  FollowUpQuestionsPayload,
  FollowUpQuestionsWithSession,
  SymptomLlmPhase,
  SymptomLlmRequestBody,
  SymptomResultsPayload,
  PriceEstimatePayload,
} from "./types";
import type { PracticeLocationPayload } from "./practiceLocation";

const SEVERITY_RANK: Record<"mild" | "moderate" | "severe", number> = {
  mild: 0,
  moderate: 1,
  severe: 2,
};

function highestConditionSeverity(
  conditions: SymptomResultsPayload["conditions"],
): "mild" | "moderate" | "severe" {
  let best: "mild" | "moderate" | "severe" = "mild";
  let rank = -1;
  for (const c of conditions) {
    const r = SEVERITY_RANK[c.condition_severity];
    if (r > rank) {
      rank = r;
      best = c.condition_severity;
    }
  }
  return best;
}

const ROUTING_RATIONALE_MAX = 500;

function buildSeverityRoutingPayload(results: SymptomResultsPayload) {
  const leading = results.conditions[0];
  const rat = results.care_taxonomy.rationale_for_routing;
  const truncated =
    rat.length > ROUTING_RATIONALE_MAX ? `${rat.slice(0, ROUTING_RATIONALE_MAX)}…` : rat;
  return {
    overall_patient_severity: results.overall_patient_severity,
    highest_severity_on_differential: highestConditionSeverity(results.conditions),
    leading_condition: leading
      ? { title: leading.title, condition_severity: leading.condition_severity }
      : null,
    suggested_care_setting: results.care_taxonomy.suggested_care_setting,
    routing_rationale: truncated,
  };
}

/** Relative to `VITE_API_URL` (e.g. `http://127.0.0.1:8000/api`). */
const SURVEY_LLM_PATH = "symptom/survey-llm/";

function getSurveyLlmErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401) {
      return "Please sign in to use Symptom Check.";
    }
    const data = err.response?.data as { detail?: unknown } | undefined;
    const detail = data?.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return JSON.stringify(detail);
    }
    if (detail && typeof detail === "object") {
      return JSON.stringify(detail);
    }
    return err.message || `Request failed (${String(status)})`;
  }
  return err instanceof Error ? err.message : "Symptom Check request failed.";
}

type SurveyLlmApiResponse = {
  raw_text: string;
  phase: SymptomLlmPhase;
  session_id: string;
};

/** Raw model output from Django; client validates against survey JSON schemas. */
async function postSymptomSurveyLlm(body: SymptomLlmRequestBody): Promise<SurveyLlmApiResponse> {
  try {
    const { data } = await apiClient.post<SurveyLlmApiResponse>(SURVEY_LLM_PATH, body);
    if (typeof data.raw_text === "string" && data.raw_text.trim().length > 0) {
      return data;
    }
    throw new Error("Survey LLM response missing raw_text.");
  } catch (err) {
    throw new Error(getSurveyLlmErrorMessage(err));
  }
}

/** First LLM call: after intake; drives dynamic step-2 questions. */
export async function requestFollowUpQuestions(input: {
  symptoms: string;
  insuranceLabel: string;
  practiceLocation?: PracticeLocationPayload | null;
}): Promise<FollowUpQuestionsWithSession> {
  const body: SymptomLlmRequestBody = {
    phase: "followup_questions",
    system_prompt: followupContext.trim(),
    user_payload: {
      symptoms: input.symptoms,
      insurance_label: input.insuranceLabel,
      ...(input.practiceLocation
        ? { practice_location: input.practiceLocation }
        : {}),
    },
  };

  const res = await postSymptomSurveyLlm(body);
  const parsed = parseJsonObjectFromLlm(res.raw_text);
  const validated = validateFollowUpQuestionsPayload(parsed);
  const out: FollowUpQuestionsWithSession = {
    questions: validated.questions,
    session_id: res.session_id,
  };
  return out;
}

/** Second round of follow-up questions: based on first round answers to narrow further. */
export async function requestSecondFollowUpQuestions(input: {
  symptoms: string;
  insuranceLabel: string;
  firstRoundAnswers: StructuredFollowUpAnswer[];
  /** Same `SymptomSession.public_id` as round 1 so Django appends to one persisted survey session. */
  sessionId: string;
  practiceLocation?: PracticeLocationPayload | null;
}): Promise<FollowUpQuestionsPayload> {
  const body: SymptomLlmRequestBody = {
    phase: "followup_questions_round_2",
    system_prompt: followupRound2Context.trim(),
    user_payload: {
      symptoms: input.symptoms,
      insurance_label: input.insuranceLabel,
      first_round_answers: input.firstRoundAnswers,
      ...(input.practiceLocation
        ? { practice_location: input.practiceLocation }
        : {}),
    },
    session_id: input.sessionId,
  };

  const res = await postSymptomSurveyLlm(body);
  const parsed = parseJsonObjectFromLlm(res.raw_text);
  return validateFollowUpQuestionsPayload(parsed);
}

/** Snapshot sent back to the model on call 2 (ids tie answers to prompts). */
export type StructuredFollowUpAnswer = {
  question_id: string;
  question_prompt: string;
  input_type: string;
  value: string | number | string[];
};

/** Second LLM call: symptoms + structured answers → conditions + severities + care_taxonomy. */
export async function requestConditionAssessment(input: {
  symptoms: string;
  insuranceLabel: string;
  followUpAnswers: StructuredFollowUpAnswer[];
  /** Required so Django updates the same row created on the follow-up phase. */
  sessionId: string;
  practiceLocation?: PracticeLocationPayload | null;
}): Promise<SymptomResultsPayload> {
  const activeMedications = loadActiveRegimen().map((m) => ({
    name: m.name,
    common_name: m.commonName,
    scientific_name: m.scientificName,
    dosage_mg: m.dosageMg,
    frequency: m.frequency,
    time_to_take: m.timeToTake,
    refill_before: m.refillBefore,
  }));

  const body: SymptomLlmRequestBody = {
    phase: "condition_assessment",
    system_prompt: resultsContext.trim(),
    user_payload: {
      symptoms: input.symptoms,
      insurance_label: input.insuranceLabel,
      follow_up_answers: input.followUpAnswers,
      active_medications: activeMedications,
      ...(input.practiceLocation
        ? { practice_location: input.practiceLocation }
        : {}),
    },
    session_id: input.sessionId,
  };

  const res = await postSymptomSurveyLlm(body);
  const parsed = parseJsonObjectFromLlm(res.raw_text);
  return validateSymptomResultsPayload(parsed);
}

/** After condition assessment + optional NPPES list: illustrative cost narrative (not a quote). */
export async function requestPriceEstimate(input: {
  insuranceLabel: string;
  /** Full assessment: severities + `care_taxonomy` drive visit-type cost tier. */
  results: SymptomResultsPayload;
  /** Top-ranked nearby facility when the NPPES call returned at least one row; otherwise null. */
  topFacility: { npi: string; name: string; address_line: string } | null;
  sessionId: string;
}): Promise<PriceEstimatePayload> {
  const { results } = input;
  const body: SymptomLlmRequestBody = {
    phase: "price_estimate_context",
    system_prompt: priceEstimateContext.trim(),
    user_payload: {
      insurance_label: input.insuranceLabel.trim() || "Not specified",
      possible_conditions: results.conditions.map((c) => ({
        title: c.title,
        explanation: c.explanation,
        why_possible: c.why_possible,
        condition_severity: c.condition_severity,
      })),
      severity_and_routing: buildSeverityRoutingPayload(results),
      /** Top NPPES site for setting context only; not the user's insurance payer. */
      referenced_facility: input.topFacility,
    },
    session_id: input.sessionId,
  };

  const res = await postSymptomSurveyLlm(body);
  const parsed = parseJsonObjectFromLlm(res.raw_text);
  return validatePriceEstimatePayload(parsed);
}

export type {
  FollowUpQuestionsPayload,
  FollowUpQuestionsWithSession,
  SymptomResultsPayload,
  SymptomLlmPhase,
  PriceEstimatePayload,
};
