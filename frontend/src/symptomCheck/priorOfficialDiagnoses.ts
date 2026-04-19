import type { SymptomSessionListItem } from "../api/queries";
import { parsePostVisitDiagnosis } from "./postVisitDiagnosisTypes";

/**
 * Collects unique official (post-visit) diagnosis labels from `GET /api/sessions/` for the
 * signed-in user. Used when the patient opts in to sending prior diagnoses to the first
 * follow-up LLM call (`prior_official_diagnoses` on `user_payload`).
 */
export function uniquePriorOfficialDiagnoses(sessions: SymptomSessionListItem[]): string[] {
  return postVisitDiagnosisListFromSessions(sessions).map((r) => r.text);
}

/** One row per unique post-visit label (first occurrence wins; `sessions` should be newest-first). */
export type PostVisitDiagnosisListItem = {
  text: string;
  session_id: string;
  created_at: string;
};

export function postVisitDiagnosisListFromSessions(
  sessions: SymptomSessionListItem[],
): PostVisitDiagnosisListItem[] {
  const seen = new Set<string>();
  const out: PostVisitDiagnosisListItem[] = [];
  for (const s of sessions) {
    const p = parsePostVisitDiagnosis(s.post_visit_diagnosis ?? null);
    if (!p?.text) continue;
    const t = p.text.trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      text: t,
      session_id: s.session_id,
      created_at: s.created_at,
    });
  }
  return out;
}

/** Anything with a `text` field (e.g. `GET /api/prior-diagnoses/` rows). */
export type PriorDiagnosisTextRow = { text: string };

/**
 * Deduplicated labels for Symptom Check step 1: manual entries from `GET /api/prior-diagnoses/`
 * first (newest-first list order), then unique post-visit labels from session history.
 */
export function mergedPriorOfficialDiagnosisLabels(
  sessions: SymptomSessionListItem[],
  manual: readonly PriorDiagnosisTextRow[],
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  for (const m of manual) {
    push(m.text);
  }
  for (const label of uniquePriorOfficialDiagnoses(sessions)) {
    push(label);
  }
  return out;
}
