/**
 * Parses JSON returned by an LLM, tolerating optional ```json fences.
 */
export function parseJsonObjectFromLlm(raw: string): unknown {
  const trimmed = raw.trim();
  const fenceMatch = /^```(?:json)?\s*([\s\S]*?)```$/i.exec(trimmed);
  const jsonText = fenceMatch ? fenceMatch[1].trim() : trimmed;
  return JSON.parse(jsonText) as unknown;
}
