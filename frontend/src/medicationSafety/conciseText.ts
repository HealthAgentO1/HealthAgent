import type { PairwiseInteractionRow } from "./regimenSafetyClient";

/** Shorten SPL / label excerpts for summary UI. */
export function truncateAtWord(text: string, maxChars: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= maxChars) {
    return t;
  }
  const slice = t.slice(0, maxChars);
  const lastSpace = slice.lastIndexOf(" ");
  const core = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${core.trim()}…`;
}

/**
 * One or two sentences for the conflicts panel: direction line plus trimmed label excerpt.
 */
export function concisePairwiseExplanation(row: PairwiseInteractionRow): string {
  const dir = (row.direction || "").replace(/\s+/g, " ").trim();
  const body = (row.description || "").replace(/\s+/g, " ").trim();
  const excerpt = truncateAtWord(body, 220);
  if (dir && excerpt) {
    return `${dir} ${excerpt}`;
  }
  if (excerpt) {
    return excerpt;
  }
  return dir || "FDA label text suggests reviewing this combination with a clinician.";
}
