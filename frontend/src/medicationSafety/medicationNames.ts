/**
 * Display rules: common (familiar/brand) is the prominent line when both names exist and differ;
 * scientific (generic/INN) is smaller underneath. If only one name is available, show a single line.
 */
export function getMedicationTitleLines(
  commonName: string | null | undefined,
  scientificName: string | null | undefined,
  legacyName?: string | null,
): { primary: string; secondary: string | null } {
  const c = (commonName ?? "").trim();
  const s = (scientificName ?? "").trim();
  const l = (legacyName ?? "").trim();

  if (c && s) {
    if (c.toLowerCase() === s.toLowerCase()) {
      return { primary: c, secondary: null };
    }
    return { primary: c, secondary: s };
  }
  if (c) return { primary: c, secondary: null };
  if (s) return { primary: s, secondary: null };
  if (l) return { primary: l, secondary: null };
  return { primary: "Medication", secondary: null };
}

export function formatExtractedMedicationLabel(m: {
  name?: string;
  common_name?: string | null;
  scientific_name?: string | null;
}): string {
  const { primary, secondary } = getMedicationTitleLines(
    m.common_name ?? null,
    m.scientific_name ?? null,
    m.name ?? null,
  );
  return secondary ? `${primary} · ${secondary}` : primary;
}
