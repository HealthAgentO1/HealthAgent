/**
 * Shared TypeScript shapes for the Symptom Check “LLM as JSON API” contract.
 * Field names align with `followup_context.txt` / `results_context.txt` so the
 * same types work for mock data, a future HTTP gateway, and UI rendering.
 */

export type QuestionInputType =
  | "single_choice"
  | "multi_choice"
  | "text"
  | "scale_1_10";

export type FollowUpOption = {
  id: string;
  label: string;
};

export type FollowUpQuestion = {
  id: string;
  prompt: string;
  helper_text?: string;
  required: boolean;
  input_type: QuestionInputType;
  options?: FollowUpOption[];
  scale_min?: number;
  scale_max?: number;
  scale_min_label?: string;
  scale_max_label?: string;
};

export type FollowUpQuestionsPayload = {
  questions: FollowUpQuestion[];
};

export type ConditionAssessment = {
  title: string;
  explanation: string;
  why_possible: string;
  condition_severity: "mild" | "moderate" | "severe";
};

/** Returned on the second LLM call; intended for routing/NPPES follow-up, not patient display. */
export type CareTaxonomy = {
  suggested_care_setting: string;
  taxonomy_codes: string[];
  rationale_for_routing: string;
};

export type SymptomResultsPayload = {
  overall_patient_severity: "mild" | "moderate" | "severe";
  conditions: ConditionAssessment[];
  care_taxonomy: CareTaxonomy;
};

export type SymptomLlmPhase = "followup_questions" | "condition_assessment";

/** POST body for `POST /api/symptom/survey-llm/` (matches `SymptomSurveyLlmSerializer`). */
export type SymptomLlmRequestBody = {
  phase: SymptomLlmPhase;
  system_prompt: string;
  user_payload: Record<string, unknown>;
};

/** Per-question value in component state; shape depends on `input_type`. */
export type FollowUpAnswer =
  | string
  | number
  | string[]
  | undefined
  | null;
