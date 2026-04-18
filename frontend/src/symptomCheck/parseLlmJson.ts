/**
 * Parses model output as JSON. Many providers wrap JSON in a single Markdown
 * code fence; we strip one outer fence if present, then `JSON.parse`.
 * Callers should still run schema validation (see `validatePayloads.ts`).
 */
export function parseJsonObjectFromLlm(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(jsonText) as unknown;
}
