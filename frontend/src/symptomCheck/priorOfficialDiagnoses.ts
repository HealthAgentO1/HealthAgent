import type { SymptomSessionListItem } from "../api/queries";
import { parsePostVisitDiagnosis } from "./postVisitDiagnosisTypes";

/**
 * Collects unique official (post-visit) diagnosis labels from `GET /api/sessions/` for the
 * signed-in user. Used when the patient opts in to sending prior diagnoses to the first
 * follow-up LLM call (`prior_official_diagnoses` on `user_payload`).
 */
export function uniquePriorOfficialDiagnoses(sessions: SymptomSessionListItem[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of sessions) {
    const p = parsePostVisitDiagnosis(s.post_visit_diagnosis ?? null);
    if (!p?.text) continue;
    const t = p.text.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
