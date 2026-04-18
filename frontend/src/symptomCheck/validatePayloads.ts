/**
 * Validate and parse LLM JSON responses
 */

import type {
  InitialAssessment,
  FollowupQuestionResponse,
  FinalAssessment,
} from "./symptomLlmClient";

export const validateInitialAssessment = (
  data: any
): InitialAssessment | null => {
  try {
    const required = [
      "summary",
      "possible_conditions",
      "needs_followup",
      "confidence_level",
    ];
    const missingKey = required.find((key) => !(key in data));

    if (missingKey) {
      console.error(`Missing required field: ${missingKey}`);
      return null;
    }

    // Validate types
    if (typeof data.summary !== "string") {
      console.error("summary must be a string");
      return null;
    }

    if (!Array.isArray(data.possible_conditions)) {
      console.error("possible_conditions must be an array");
      return null;
    }

    if (typeof data.needs_followup !== "boolean") {
      console.error("needs_followup must be a boolean");
      return null;
    }

    const validLevels = ["high", "medium", "low"];
    if (!validLevels.includes(data.confidence_level)) {
      console.error(
        `confidence_level must be one of: ${validLevels.join(", ")}`
      );
      return null;
    }

    return data as InitialAssessment;
  } catch (error) {
    console.error("Error validating initial assessment:", error);
    return null;
  }
};

export const validateFollowupQuestionResponse = (
  data: any
): FollowupQuestionResponse | null => {
  try {
    const required = ["questions", "reasoning", "expected_impact"];
    const missingKey = required.find((key) => !(key in data));

    if (missingKey) {
      console.error(`Missing required field: ${missingKey}`);
      return null;
    }

    if (!Array.isArray(data.questions)) {
      console.error("questions must be an array");
      return null;
    }

    // Validate each question
    const validTypes = ["multiple_choice", "yes_no", "scale", "text"];
    for (const q of data.questions) {
      if (!q.id || !q.question || !q.type) {
        console.error("Each question must have id, question, and type");
        return null;
      }

      if (!validTypes.includes(q.type)) {
        console.error(`Invalid question type: ${q.type}`);
        return null;
      }

      if (q.type === "multiple_choice" && !Array.isArray(q.options)) {
        console.error(
          "multiple_choice questions must have an options array"
        );
        return null;
      }
    }

    return {
      ...data,
      should_proceed_to_results:
        data.should_proceed_to_results !== undefined
          ? data.should_proceed_to_results
          : false,
    } as FollowupQuestionResponse;
  } catch (error) {
    console.error("Error validating followup questions:", error);
    return null;
  }
};

export const validateFinalAssessment = (
  data: any
): FinalAssessment | null => {
  try {
    const required = [
      "triage_level",
      "possible_conditions",
      "key_findings",
      "recommendations",
    ];
    const missingKey = required.find((key) => !(key in data));

    if (missingKey) {
      console.error(`Missing required field: ${missingKey}`);
      return null;
    }

    const validLevels = ["emergency", "urgent", "routine"];
    if (!validLevels.includes(data.triage_level)) {
      console.error(
        `triage_level must be one of: ${validLevels.join(", ")}`
      );
      return null;
    }

    if (!Array.isArray(data.possible_conditions)) {
      console.error("possible_conditions must be an array");
      return null;
    }

    if (!Array.isArray(data.key_findings)) {
      console.error("key_findings must be an array");
      return null;
    }

    if (!Array.isArray(data.recommendations)) {
      console.error("recommendations must be an array");
      return null;
    }

    return data as FinalAssessment;
  } catch (error) {
    console.error("Error validating final assessment:", error);
    return null;
  }
};
