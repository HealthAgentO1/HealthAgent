import type { DrugRiskTier } from "./drugRiskAssessment";

/**
 * SPL / recall risk tier chips (high | moderate | low) — same palette as interaction severities.
 */
export function drugRiskTierChipClasses(tier: DrugRiskTier): string {
  if (tier === "high") {
    return "bg-error-container/40 text-on-error-container border border-red-800/40";
  }
  if (tier === "moderate") {
    return "bg-orange-500/12 text-orange-800 border border-orange-400/35";
  }
  return "bg-teal-500/12 text-teal-800 border border-teal-400/35";
}

/**
 * Severity chips for drug–drug interaction hints (severe | moderate | mild).
 * Aligns visually with `SymptomCheckPage` condition severity styling (red / amber / teal).
 */
export function interactionSeverityChipClasses(level: string | null | undefined): string {
  const s = (level || "").toLowerCase();
  if (s === "severe") {
    return "bg-error-container/40 text-on-error-container border border-red-800/40";
  }
  if (s === "moderate") {
    return "bg-orange-500/12 text-orange-800 border border-orange-400/35";
  }
  if (s === "mild") {
    return "bg-teal-500/12 text-teal-800 border border-teal-400/35";
  }
  return "bg-surface-container-high text-on-surface-variant border border-outline-variant/30";
}
