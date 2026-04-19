import type { SymptomResultsPayload } from "./types";

/**
 * Identifies which assessment + server session a saved price estimate belongs to.
 * Used to skip re-calling the price LLM on resume / localStorage restore.
 */
export function priceEstimateCacheFingerprint(
  surveyBackendSessionId: string,
  results: SymptomResultsPayload,
): string {
  return `${surveyBackendSessionId}::${JSON.stringify({
    c: results.conditions.map((x) => [x.title, x.condition_severity]),
    o: results.overall_patient_severity,
    s: results.care_taxonomy.suggested_care_setting,
    t: results.care_taxonomy.taxonomy_codes,
  })}`;
}
