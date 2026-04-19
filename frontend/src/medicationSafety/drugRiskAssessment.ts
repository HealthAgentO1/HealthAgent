import type { PerDrugLabelSafety } from "./regimenSafetyClient";

export type DrugRiskTier = "high" | "moderate" | "low";

/** SPL section keys → relative risk tier for UI emphasis (not clinical grading). */
export function splSectionRiskTier(sectionKey: string): DrugRiskTier {
  if (
    sectionKey === "boxed_warning" ||
    sectionKey === "boxed_warning_table" ||
    sectionKey === "contraindications" ||
    sectionKey === "contraindications_table"
  ) {
    return "high";
  }
  if (
    sectionKey === "warnings_and_cautions" ||
    sectionKey === "warnings" ||
    sectionKey === "warnings_table" ||
    sectionKey === "drug_interactions" ||
    sectionKey === "drug_interactions_table" ||
    sectionKey === "drug_and_or_laboratory_test_interactions" ||
    sectionKey === "drug_and_or_laboratory_test_interactions_table" ||
    sectionKey === "precautions" ||
    sectionKey === "precautions_table"
  ) {
    return "moderate";
  }
  return "low";
}

function normName(s: string): string {
  return s.trim().toLowerCase();
}

/**
 * Highest tier for this medication from SPL sections + enforcement recalls.
 * Used for regimen card badge (high only) and detail page overview.
 */
export function aggregateDrugRiskTier(
  row: PerDrugLabelSafety | undefined,
  recallsForMed: Array<Record<string, unknown>>,
): DrugRiskTier | null {
  if (!row) {
    return null;
  }
  if (!row.label_found) {
    return "moderate";
  }
  const sections = row.sections || {};
  let best: DrugRiskTier | null = null;

  const rank: Record<DrugRiskTier, number> = { low: 0, moderate: 1, high: 2 };
  const consider = (t: DrugRiskTier) => {
    if (!best || rank[t] > rank[best]) {
      best = t;
    }
  };

  for (const key of Object.keys(sections)) {
    if (sections[key]) {
      consider(splSectionRiskTier(key));
    }
  }

  for (const r of recallsForMed) {
    const c = r.classification;
    if (c === "I") {
      consider("high");
    } else if (c === "II" || c === "III") {
      consider("moderate");
    } else if (r.reason_for_recall) {
      consider("low");
    }
  }

  return best;
}

export function recallsForProfileMedication(
  medName: string,
  recalls: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const n = normName(medName);
  return recalls.filter((r) => normName(String(r.profile_medication ?? "")) === n);
}

export function findPerDrugRow(
  medName: string,
  rows: PerDrugLabelSafety[],
): PerDrugLabelSafety | undefined {
  const n = normName(medName);
  return rows.find((r) => normName(r.drug) === n);
}
