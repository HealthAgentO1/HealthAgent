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

/** Follow-up LLM response plus Django `SymptomSession.public_id` from `POST /symptom/survey-llm/`. */
export type FollowUpQuestionsWithSession = FollowUpQuestionsPayload & {
  session_id: string;
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
  /**
   * Client-only: insurer id from step 1, copied here when results load so the NPPES request
   * always has a slug (avoids races with React state / resume).
   */
  intake_insurer_slug?: string;
};

export type SymptomLlmPhase =
  | "followup_questions"
  | "followup_questions_round_2"
  | "condition_assessment"
  | "price_estimate_context";

/** LLM JSON for illustrative cost copy on the results step (`price_estimate_context` phase). */
export type PriceEstimatePayload = {
  /** Short human-readable band, e.g. "~$150–$600" or "Roughly $500–$3,000 (before plan)" — not a quote. */
  cost_range_label: string;
  /** What the band assumes, plan caveats, and why actual cost differs. */
  cost_range_explanation: string;
  /** Optional extra paragraphs after the explanation. */
  paragraphs?: string[];
};

/** POST body for `POST /api/symptom/survey-llm/` (matches `SymptomSurveyLlmSerializer`). */
export type SymptomLlmRequestBody = {
  phase: SymptomLlmPhase;
  system_prompt: string;
  user_payload: Record<string, unknown>;
  /** Continues the same `SymptomSession` row as the follow-up phase (condition assessment). */
  session_id?: string;
};

/** Per-question value in component state; shape depends on `input_type`. */
export type FollowUpAnswer =
  | string
  | number
  | string[]
  | undefined
  | null;
