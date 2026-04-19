/**
 * Active regimen entries are stored in the browser per signed-in account (see medicationRegimenStorage.ts).
 * Optional fields render as "-" on the list and detail views when empty.
 */
export type ActiveMedication = {
  id: string;
  /** Primary label for legacy code paths (matches the large title when possible). */
  name: string;
  /** Familiar or brand name from extraction; null if only scientific / legacy single name. */
  commonName: string | null;
  /** Generic / INN (scientific) name from extraction; null if only common / legacy single name. */
  scientificName: string | null;
  rxnormId: string | null;
  /** Dosage amount in mg; stored as string so users can enter decimals freely. */
  dosageMg: string | null;
  frequency: string | null;
  timeToTake: string | null;
  /** Free-text, e.g. "14 days" — how long until a refill is needed. */
  refillBefore: string | null;
  createdAt: string;
};
