/**
 * Non-LLM disclaimer shown under the price estimate. Keeps the survey model focused on
 * a short band + scenario blurb only (saves tokens vs regenerating this every request).
 */
export const PRICE_ESTIMATE_STATIC_DISCLAIMER_PARAGRAPHS: readonly string[] = [
  "When visiting an emergency department, expect separate charges for the facility and any professional services, which can increase the total.",
  "If symptoms are mild, urgent care or a primary care visit might be less costly—but always prioritize safety and seek emergency care if needed.",
];
