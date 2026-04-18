/**
 * Symptom LLM Client
 * Handles communication with backend LLM symptom assessment API
 */

import { apiClient } from "../api/client";

export interface InitialAssessment {
  summary: string;
  possible_conditions: string[];
  needs_followup: boolean;
  followup_areas?: string[];
  confidence_level: "high" | "medium" | "low";
  error?: string;
}

export interface FollowupQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "yes_no" | "scale" | "text";
  options?: string[];
  purpose?: string;
}

export interface FollowupQuestionResponse {
  questions: FollowupQuestion[];
  reasoning: string;
  expected_impact: string;
  should_proceed_to_results: boolean;
  error?: string;
}

export interface PossibleCondition {
  condition: string;
  likelihood: "high" | "medium" | "low";
  explanation: string;
}

export interface FinalAssessment {
  triage_level: "emergency" | "urgent" | "routine";
  possible_conditions: PossibleCondition[];
  key_findings: string[];
  recommendations: string[];
  differential_diagnosis: string;
  urgency_explanation: string;
  error?: string;
}

/**
 * Start symptom check - send initial symptoms and get assessment
 */
export const startSymptomCheck = async (
  symptoms: string,
  insuranceDetails: Record<string, any>
): Promise<{
  session_id: number;
  assessment: InitialAssessment;
  needs_followup: boolean;
}> => {
  const { data } = await apiClient.post("/symptom-check/start/", {
    symptoms,
    insurance_details: insuranceDetails,
  });
  return data;
};

/**
 * Get followup questions to narrow diagnosis
 */
export const getFollowupQuestions = async (
  sessionId: number,
  answers: Record<string, any>
): Promise<FollowupQuestionResponse> => {
  const { data } = await apiClient.post(
    `/symptom-check/${sessionId}/followup/`,
    { answers }
  );
  return data;
};

/**
 * Finalize assessment and get results
 */
export const finalizeAssessment = async (
  sessionId: number,
  finalAnswers: Record<string, any>
): Promise<FinalAssessment> => {
  const { data } = await apiClient.post(
    `/symptom-check/${sessionId}/finalize/`,
    { final_answers: finalAnswers }
  );
  return data;
};
