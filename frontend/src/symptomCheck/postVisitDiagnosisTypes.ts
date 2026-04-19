/** Persisted on `SymptomSession.post_visit_diagnosis` (Django JSONField). */
export type PostVisitDiagnosis = {
  text: string;
  source: "llm_condition" | "custom";
  matched_condition_title: string | null;
};

const OTHER_VALUE = "__other__";

export function parsePostVisitDiagnosis(raw: unknown): PostVisitDiagnosis | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  const source = o.source;
  if (!text || (source !== "llm_condition" && source !== "custom")) return null;
  const matched = o.matched_condition_title;
  return {
    text,
    source,
    matched_condition_title:
      typeof matched === "string" && matched.trim() ? matched.trim() : null,
  };
}

/** Sentinel for the “Other (type your diagnosis)” row in the condition `<select>`. */
export { OTHER_VALUE };
