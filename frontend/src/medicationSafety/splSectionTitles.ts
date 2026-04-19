/**
 * Human-readable titles for openFDA SPL field ids returned in `per_drug_label_safety.sections`.
 * Order here controls default display order in the interaction alerts panel.
 */
export const SPL_SECTION_DISPLAY_ORDER: string[] = [
  "boxed_warning",
  "boxed_warning_table",
  "contraindications",
  "contraindications_table",
  "warnings_and_cautions",
  "warnings",
  "warnings_table",
  "precautions",
  "precautions_table",
  "general_precautions",
  "adverse_reactions",
  "adverse_reactions_table",
  "drug_interactions",
  "drug_interactions_table",
  "drug_and_or_laboratory_test_interactions",
  "drug_and_or_laboratory_test_interactions_table",
  "information_for_patients",
  "user_safety_warnings",
  "nursing_mothers",
  "pediatric_use",
  "geriatric_use",
  "use_in_specific_populations",
];

const TITLE_MAP: Record<string, string> = {
  boxed_warning: "Boxed warning",
  boxed_warning_table: "Boxed warning (table)",
  contraindications: "Contraindications",
  contraindications_table: "Contraindications (table)",
  warnings_and_cautions: "Warnings and precautions",
  warnings: "Warnings",
  warnings_table: "Warnings (table)",
  precautions: "Precautions",
  precautions_table: "Precautions (table)",
  general_precautions: "General precautions",
  adverse_reactions: "Adverse reactions",
  adverse_reactions_table: "Adverse reactions (table)",
  drug_interactions: "Drug interactions",
  drug_interactions_table: "Drug interactions (table)",
  drug_and_or_laboratory_test_interactions: "Drug and laboratory test interactions",
  drug_and_or_laboratory_test_interactions_table: "Drug and laboratory test interactions (table)",
  information_for_patients: "Information for patients",
  user_safety_warnings: "User safety warnings",
  nursing_mothers: "Nursing mothers",
  pediatric_use: "Pediatric use",
  geriatric_use: "Geriatric use",
  use_in_specific_populations: "Use in specific populations",
};

export function titleForSplSectionKey(key: string): string {
  return TITLE_MAP[key] ?? key.replace(/_/g, " ");
}
