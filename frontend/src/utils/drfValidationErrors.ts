/**
 * Flatten Django REST Framework validation payloads (400) for display.
 * Field values may be string[], string, nested dicts, or ErrorDetail-like values.
 */

export function collectDrfMessages(value: unknown, depth = 0): string[] {
  if (depth > 8) return [];
  if (value == null) return [];
  if (typeof value === "string") return [value];
  if (typeof value === "number" || typeof value === "boolean") return [String(value)];
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectDrfMessages(item, depth + 1));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((v) =>
      collectDrfMessages(v, depth + 1),
    );
  }
  return [];
}

/** Returns a single line of messages, or null if nothing useful was found. */
export function flattenDrfError(data: unknown): string | null {
  if (data == null) return null;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data !== "object" || Array.isArray(data)) return null;

  const d = data as Record<string, unknown>;
  const parts: string[] = [];

  for (const value of Object.values(d)) {
    const msgs = collectDrfMessages(value).map((s) => s.trim()).filter(Boolean);
    if (!msgs.length) continue;
    parts.push(...msgs);
  }

  if (!parts.length) return null;
  return [...new Set(parts)].join(" ");
}
