/**
 * Runtime guards for LLM JSON: narrow `unknown` to typed payloads and fail
 * with clear errors so the UI can show a message instead of rendering bad data.
 */
import type {
  ConditionAssessment,
  FollowUpQuestion,
  FollowUpQuestionsPayload,
  PriceEstimatePayload,
  QuestionInputType,
  SymptomResultsPayload,
} from "./types";

const INPUT_TYPES = new Set([
  "single_choice",
  "multi_choice",
  "text",
  "scale_1_10",
]);

/** Canonical id for the exclusive “none of the above” option on multi-select questions (see prompts + `SymptomCheckPage`). */
export const MULTI_CHOICE_NONE_OF_ABOVE_ID = "none_of_the_above";
export const MULTI_CHOICE_NONE_OF_ABOVE_LABEL = "None of the above";

function isNoneOfTheAboveOption(o: { id: string; label: string }): boolean {
  if (o.id === MULTI_CHOICE_NONE_OF_ABOVE_ID || o.id === "none") return true;
  return o.label.trim().toLowerCase() === MULTI_CHOICE_NONE_OF_ABOVE_LABEL.toLowerCase();
}

/**
 * Ensures every multi-select question has exactly one “None of the above” choice as the last option.
 * Collapses duplicate none-like options and normalizes id/label for UI mutual-exclusion logic.
 */
export function ensureMultiChoiceNoneOption(
  options: { id: string; label: string }[],
): { id: string; label: string }[] {
  const norm = options.map((o) => ({ id: o.id, label: o.label }));
  const noneIndices = norm.map((o, i) => (isNoneOfTheAboveOption(o) ? i : -1)).filter((i) => i >= 0);

  if (noneIndices.length === 0) {
    norm.push({ id: MULTI_CHOICE_NONE_OF_ABOVE_ID, label: MULTI_CHOICE_NONE_OF_ABOVE_LABEL });
  } else {
    const first = noneIndices[0]!;
    norm[first] = { id: MULTI_CHOICE_NONE_OF_ABOVE_ID, label: MULTI_CHOICE_NONE_OF_ABOVE_LABEL };
    const rest = noneIndices.slice(1).sort((a, b) => b - a);
    for (const ri of rest) {
      norm.splice(ri, 1);
    }
  }

  const at = norm.findIndex((o) => o.id === MULTI_CHOICE_NONE_OF_ABOVE_ID);
  if (at >= 0 && at !== norm.length - 1) {
    const [row] = norm.splice(at, 1);
    norm.push(row);
  }

  if (norm.length < 2) {
    throw new Error("Invalid follow-up payload: multi_choice needs at least two options.");
  }
  return norm;
}

const SEVERITIES = new Set(["mild", "moderate", "severe"]);

type Severity = "mild" | "moderate" | "severe";

/** Narrows after `SEVERITIES.has` checks so TypeScript matches the union type. */
function asSeverity(value: string): Severity {
  if (!SEVERITIES.has(value)) {
    throw new Error(`Invalid severity: ${value}`);
  }
  return value as Severity;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function validateOption(value: unknown): value is { id: string; label: string } {
  if (!isRecord(value)) return false;
  return isNonEmptyString(value.id) && isNonEmptyString(value.label);
}

export function validateFollowUpQuestionsPayload(
  value: unknown,
): FollowUpQuestionsPayload {
  // Enforce stable `id`s so answers round-trip on the second LLM call.
  if (!isRecord(value) || !Array.isArray(value.questions)) {
    throw new Error("Invalid follow-up payload: missing questions array.");
  }

  const questions: FollowUpQuestion[] = [];
  const seenIds = new Set<string>();

  for (const item of value.questions) {
    if (!isRecord(item)) {
      throw new Error("Invalid follow-up payload: question is not an object.");
    }
    if (!isNonEmptyString(item.id)) {
      throw new Error("Invalid follow-up payload: question missing id.");
    }
    if (seenIds.has(item.id)) {
      throw new Error(`Invalid follow-up payload: duplicate question id "${item.id}".`);
    }
    seenIds.add(item.id);

    if (!isNonEmptyString(item.prompt)) {
      throw new Error(`Invalid follow-up payload: question "${item.id}" missing prompt.`);
    }
    if (typeof item.required !== "boolean") {
      throw new Error(`Invalid follow-up payload: question "${item.id}" missing required flag.`);
    }
    if (!isNonEmptyString(item.input_type) || !INPUT_TYPES.has(item.input_type)) {
      throw new Error(`Invalid follow-up payload: question "${item.id}" has invalid input_type.`);
    }
    const inputType = item.input_type as QuestionInputType;

    const helper =
      item.helper_text === undefined || item.helper_text === null
        ? undefined
        : String(item.helper_text);

    const base: FollowUpQuestion = {
      id: item.id,
      prompt: item.prompt,
      required: item.required,
      input_type: inputType,
    };
    if (helper !== undefined && helper.trim().length > 0) {
      base.helper_text = helper;
    }

    if (inputType === "single_choice" || inputType === "multi_choice") {
      if (!Array.isArray(item.options) || item.options.length < 2) {
        throw new Error(
          `Invalid follow-up payload: question "${item.id}" needs at least two options.`,
        );
      }
      const options = item.options.filter(validateOption);
      if (options.length !== item.options.length) {
        throw new Error(`Invalid follow-up payload: question "${item.id}" has invalid options.`);
      }
      base.options =
        inputType === "multi_choice" ? ensureMultiChoiceNoneOption(options) : options;
    }

    if (inputType === "scale_1_10") {
      const min = typeof item.scale_min === "number" ? item.scale_min : Number(item.scale_min);
      const max = typeof item.scale_max === "number" ? item.scale_max : Number(item.scale_max);
      if (!Number.isFinite(min) || !Number.isFinite(max)) {
        throw new Error(`Invalid follow-up payload: question "${item.id}" needs numeric scale.`);
      }
      base.scale_min = min;
      base.scale_max = max;
      if (isNonEmptyString(item.scale_min_label)) {
        base.scale_min_label = item.scale_min_label;
      }
      if (isNonEmptyString(item.scale_max_label)) {
        base.scale_max_label = item.scale_max_label;
      }
    }

    questions.push(base);
  }

  return { questions };
}

/** Second-call payload: differentials, severities, and internal `care_taxonomy`. */
export function validateSymptomResultsPayload(value: unknown): SymptomResultsPayload {
  if (!isRecord(value)) {
    throw new Error("Invalid results payload: not an object.");
  }
  if (
    !isNonEmptyString(value.overall_patient_severity) ||
    !SEVERITIES.has(value.overall_patient_severity)
  ) {
    throw new Error("Invalid results payload: overall_patient_severity missing or invalid.");
  }
  if (!Array.isArray(value.conditions) || value.conditions.length === 0) {
    throw new Error("Invalid results payload: conditions must be a non-empty array.");
  }

  const conditions: ConditionAssessment[] = value.conditions.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new Error(`Invalid results payload: condition ${index} is not an object.`);
    }
    if (!isNonEmptyString(entry.title)) {
      throw new Error(`Invalid results payload: condition ${index} missing title.`);
    }
    if (!isNonEmptyString(entry.explanation)) {
      throw new Error(`Invalid results payload: condition ${index} missing explanation.`);
    }
    if (!isNonEmptyString(entry.why_possible)) {
      throw new Error(`Invalid results payload: condition ${index} missing why_possible.`);
    }
    if (
      !isNonEmptyString(entry.condition_severity) ||
      !SEVERITIES.has(entry.condition_severity)
    ) {
      throw new Error(`Invalid results payload: condition ${index} has invalid condition_severity.`);
    }
    return {
      title: entry.title,
      explanation: entry.explanation,
      why_possible: entry.why_possible,
      condition_severity: asSeverity(entry.condition_severity),
    };
  });

  if (!isRecord(value.care_taxonomy)) {
    throw new Error("Invalid results payload: care_taxonomy missing.");
  }
  const ct = value.care_taxonomy;
  if (!isNonEmptyString(ct.suggested_care_setting)) {
    throw new Error("Invalid results payload: care_taxonomy.suggested_care_setting missing.");
  }
  if (!Array.isArray(ct.taxonomy_codes)) {
    throw new Error("Invalid results payload: care_taxonomy.taxonomy_codes must be an array.");
  }
  const taxonomy_codes = ct.taxonomy_codes.map((c) => String(c));
  if (!isNonEmptyString(ct.rationale_for_routing)) {
    throw new Error("Invalid results payload: care_taxonomy.rationale_for_routing missing.");
  }

  return {
    overall_patient_severity: asSeverity(value.overall_patient_severity),
    conditions,
    care_taxonomy: {
      suggested_care_setting: ct.suggested_care_setting,
      taxonomy_codes,
      rationale_for_routing: ct.rationale_for_routing,
    },
  };
}

export function validatePriceEstimatePayload(value: unknown): PriceEstimatePayload {
  if (!isRecord(value)) {
    throw new Error("Invalid price estimate payload: not an object.");
  }
  if (!isNonEmptyString(value.cost_range_label)) {
    throw new Error("Invalid price estimate payload: cost_range_label must be a non-empty string.");
  }
  if (!isNonEmptyString(value.cost_range_explanation)) {
    throw new Error("Invalid price estimate payload: cost_range_explanation must be a non-empty string.");
  }

  /** Legacy responses may include paragraphs; we ignore them client-side to save display noise. */
  let paragraphs: string[] | undefined;
  if ("paragraphs" in value && value.paragraphs !== undefined) {
    if (!Array.isArray(value.paragraphs)) {
      throw new Error("Invalid price estimate payload: paragraphs must be an array when present.");
    }
    const out: string[] = [];
    for (let i = 0; i < value.paragraphs.length; i += 1) {
      const p = value.paragraphs[i];
      if (!isNonEmptyString(p)) {
        throw new Error(`Invalid price estimate payload: paragraph ${i} must be a non-empty string.`);
      }
      out.push(p.trim());
    }
    paragraphs = out;
  }

  const base: PriceEstimatePayload = {
    cost_range_label: value.cost_range_label.trim(),
    cost_range_explanation: value.cost_range_explanation.trim(),
  };
  if (paragraphs !== undefined && paragraphs.length > 0) {
    base.paragraphs = paragraphs;
  }
  return base;
}
