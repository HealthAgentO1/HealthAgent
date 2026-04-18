/**
 * Types for symptom check process
 */

export type FlowStep = "intake" | "initial_questions" | "followup" | "results";

export interface SymptomIntake {
  symptoms: string;
  onset?: string;
  painRating?: number;
}

export interface InsuranceInfo {
  plan: string;
  provider: string;
  memberId?: string;
}

export interface FollowupQuestion {
  id: string;
  question: string;
  type: "multiple_choice" | "yes_no" | "scale" | "text";
  options?: string[];
}

export interface UserAnswers {
  [questionId: string]: string | number | boolean;
}

export interface AssessmentState {
  sessionId: number | null;
  symptoms: string;
  insurance: InsuranceInfo | null;
  initialAssessment: InitialAssessmentData | null;
  followupQuestions: FollowupQuestion[] | null;
  userAnswers: UserAnswers;
  finalAssessment: FinalAssessmentData | null;
  loading: boolean;
  error: string | null;
}

export interface InitialAssessmentData {
  summary: string;
  possible_conditions: string[];
  needs_followup: boolean;
  followup_areas?: string[];
  confidence_level: "high" | "medium" | "low";
}

export interface FinalAssessmentData {
  triage_level: "emergency" | "urgent" | "routine";
  possible_conditions: Array<{
    condition: string;
    likelihood: "high" | "medium" | "low";
    explanation: string;
  }>;
  key_findings: string[];
  recommendations: string[];
  differential_diagnosis: string;
  urgency_explanation: string;
}

export const getTriageLevelColor = (level: string): string => {
  switch (level) {
    case "emergency":
      return "error";
    case "urgent":
      return "warning";
    case "routine":
      return "info";
    default:
      return "secondary";
  }
};

export const getTriageLevelLabel = (level: string): string => {
  switch (level) {
    case "emergency":
      return "🚨 Emergency";
    case "urgent":
      return "⚠️ Urgent";
    case "routine":
      return "✓ Routine";
    default:
      return "Unknown";
  }
};
