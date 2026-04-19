/** Empty optional values show as a hyphen in the Medication Safety UI. */
export function displayOrDash(value: string | null | undefined): string {
  const t = (value ?? "").trim();
  return t.length > 0 ? t : "-";
}
