import followupContext from "./prompts/followup_context.txt?raw";
import resultsContext from "./prompts/results_context.txt?raw";
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

const MOCK_FOLLOWUP_RESPONSE = `{
  "questions": [
    {
      "id": "symptom_onset",
      "prompt": "When did these symptoms start or noticeably change?",
      "helper_text": "Choose the option that best matches the beginning of this episode.",
      "required": true,
      "input_type": "single_choice",
      "options": [
        { "id": "lt24", "label": "Within the last 24 hours" },
        { "id": "d1_3", "label": "Between 1 and 3 days ago" },
        { "id": "gt7", "label": "More than a week ago" }
      ]
    },
    {
      "id": "associated_symptoms",
      "prompt": "Which other symptoms are you experiencing right now?",
      "helper_text": "Select all that apply. If none apply, leave all unchecked.",
      "required": false,
      "input_type": "multi_choice",
      "options": [
        { "id": "fever", "label": "Fever or chills" },
        { "id": "nausea", "label": "Nausea or vomiting" },
        { "id": "dizziness", "label": "Dizziness or fainting" },
        { "id": "breath", "label": "Shortness of breath" },
        { "id": "none", "label": "None of the above" }
      ]
    },
    {
      "id": "pain_or_discomfort_level",
      "prompt": "If pain or discomfort applies, how severe is it right now?",
      "helper_text": "1 is barely noticeable; 10 is the worst you can imagine.",
      "required": true,
      "input_type": "scale_1_10",
      "scale_min": 1,
      "scale_max": 10,
      "scale_min_label": "Mild",
      "scale_max_label": "Severe"
    },
    {
      "id": "aggravating_factors",
      "prompt": "What tends to make the symptoms worse, if anything?",
      "helper_text": "Movement, eating, stress, certain positions, etc.",
      "required": true,
      "input_type": "text"
    }
  ]
}`;

const MOCK_RESULTS_RESPONSE = `{
  "overall_patient_severity": "moderate",
  "conditions": [
    {
      "title": "Acute appendicitis (possible)",
      "explanation": "Appendicitis is inflammation of the appendix, a small pouch attached to the colon. It often starts as vague abdominal discomfort and can localize to the right lower abdomen.",
      "why_possible": "Right-lower-quadrant pain that worsens with movement, together with nausea, overlaps the pattern clinicians consider when appendicitis is on the differential.",
      "condition_severity": "severe"
    },
    {
      "title": "Kidney stone with referred pain (possible)",
      "explanation": "A kidney stone is a hard deposit that can form in the urinary tract. Severe, cramping pain can be felt in the abdomen or flank and sometimes radiates.",
      "why_possible": "Intense abdominal pain can occur with stones even when urinary symptoms are not prominent yet, so this remains a common alternate explanation.",
      "condition_severity": "moderate"
    },
    {
      "title": "Gastroenteritis (less likely but possible)",
      "explanation": "Gastroenteritis is inflammation of the stomach and intestines, often from an infection, that can cause nausea and abdominal discomfort.",
      "why_possible": "Nausea with abdominal discomfort can fit a viral stomach bug, though focal right-sided pain makes this a less specific match than other possibilities.",
      "condition_severity": "mild"
    }
  ],
  "care_taxonomy": {
    "suggested_care_setting": "urgent_care",
    "taxonomy_codes": ["261QU0200X", "207Q00000X"],
    "rationale_for_routing": "Symptoms may warrant timely in-person evaluation; primary care follow-up may be appropriate after urgent assessment depending on exam and tests."
  }
}`;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const endpoint =
  (import.meta.env.VITE_SYMPTOM_LLM_URL as string | undefined)?.trim() || "";

async function postSymptomLlm(body: SymptomLlmRequestBody): Promise<string> {
  if (!endpoint) {
    await sleep(450);
    return body.phase === "followup_questions"
      ? MOCK_FOLLOWUP_RESPONSE
      : MOCK_RESULTS_RESPONSE;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Symptom LLM endpoint responded with HTTP ${response.status}.`);
  }

  const parsed: unknown = await response.json();
  if (typeof parsed === "string") {
    return parsed;
  }
  if (isRecord(parsed) && typeof parsed.raw_text === "string") {
    return parsed.raw_text;
  }
  if (isRecord(parsed) && typeof parsed.content === "string") {
    return parsed.content;
  }
  return JSON.stringify(parsed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

  const raw = await postSymptomLlm(body);
  const parsed = parseJsonObjectFromLlm(raw);
  return validateFollowUpQuestionsPayload(parsed);
}

export type StructuredFollowUpAnswer = {
  question_id: string;
  question_prompt: string;
  input_type: string;
  value: string | number | string[];
};

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

  const raw = await postSymptomLlm(body);
  const parsed = parseJsonObjectFromLlm(raw);
  const validated = validateSymptomResultsPayload(parsed);

  // Not shown in the UI; reserved for a downstream care-routing API.
  console.info("[symptom-check] care_taxonomy (debug, downstream API)", validated.care_taxonomy);

  return validated;
}

export type { FollowUpQuestionsPayload, SymptomResultsPayload, SymptomLlmPhase };
