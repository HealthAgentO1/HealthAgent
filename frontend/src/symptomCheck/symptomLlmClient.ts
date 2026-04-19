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
import resultsContext from "./prompts/results_context.txt?raw";
import { apiClient } from "../api/client";
import { parseJsonObjectFromLlm } from "./parseLlmJson";
import {
  validateFollowUpQuestionsPayload,
  validateSymptomResultsPayload,
} from "./validatePayloads";
import type {
  FollowUpQuestionsPayload,
  SymptomLlmPhase,
  SymptomLlmRequestBody,
  SymptomResultsPayload,
} from "./types";

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

/** Raw model output from Django; client validates against survey JSON schemas. */
async function postSymptomSurveyLlm(body: SymptomLlmRequestBody): Promise<string> {
  try {
    const { data } = await apiClient.post<{ raw_text: string }>(SURVEY_LLM_PATH, body);
    if (typeof data.raw_text === "string" && data.raw_text.trim().length > 0) {
      return data.raw_text;
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
}): Promise<FollowUpQuestionsPayload> {
  const body: SymptomLlmRequestBody = {
    phase: "followup_questions",
    system_prompt: followupContext.trim(),
    user_payload: {
      symptoms: input.symptoms,
      insurance_label: input.insuranceLabel,
    },
  };

  const raw = await postSymptomSurveyLlm(body);
  const parsed = parseJsonObjectFromLlm(raw);
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
}): Promise<SymptomResultsPayload> {
  const body: SymptomLlmRequestBody = {
    phase: "condition_assessment",
    system_prompt: resultsContext.trim(),
    user_payload: {
      symptoms: input.symptoms,
      insurance_label: input.insuranceLabel,
      follow_up_answers: input.followUpAnswers,
    },
  };

  const raw = await postSymptomSurveyLlm(body);
  const parsed = parseJsonObjectFromLlm(raw);
  return validateSymptomResultsPayload(parsed);
}

export type { FollowUpQuestionsPayload, SymptomResultsPayload, SymptomLlmPhase };
