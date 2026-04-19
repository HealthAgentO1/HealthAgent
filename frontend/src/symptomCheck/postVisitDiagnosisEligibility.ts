/**
 * Post-visit (official) diagnosis is only offered after the user has navigated away from
 * Symptom Check while on the results step at least once (`localStorage` flag). That avoids
 * prompting for a clinician diagnosis during the same visit as the initial illustrative results.
 */
const STORAGE_PREFIX = "healthos.sc.post_visit_eligible.";

export function markPostVisitDiagnosisEligible(sessionPublicId: string): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_PREFIX + sessionPublicId, "1");
  } catch {
    /* quota / private mode */
  }
}

export function isPostVisitDiagnosisEligible(sessionPublicId: string | null): boolean {
  if (!sessionPublicId || typeof window === "undefined" || !window.localStorage) return false;
  try {
    return window.localStorage.getItem(STORAGE_PREFIX + sessionPublicId) === "1";
  } catch {
    return false;
  }
}
