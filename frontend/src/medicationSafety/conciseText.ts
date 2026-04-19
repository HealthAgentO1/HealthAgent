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
 * Conflicts list preview: prefer server `description_plain` (batched LLM), else
 * direction line plus trimmed raw label excerpt.
 */
export function concisePairwiseExplanation(row: PairwiseInteractionRow): string {
  const plain = (row.description_plain || "").replace(/\s+/g, " ").trim();
  if (plain) {
    return truncateAtWord(plain, 320);
  }
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
