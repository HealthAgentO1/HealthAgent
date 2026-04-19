import type { ActiveMedication } from "./types";

const STORAGE_KEY = "healthos_active_regimen_v1";
const LEGACY_STORAGE_KEY = "healthagent_active_regimen_v1";

function isActiveMedication(x: unknown): x is ActiveMedication {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  const commonOk =
    o.commonName === undefined ||
    o.commonName === null ||
    typeof o.commonName === "string";
  const sciOk =
    o.scientificName === undefined ||
    o.scientificName === null ||
    typeof o.scientificName === "string";
  return (
    typeof o.id === "string" &&
    typeof o.name === "string" &&
    commonOk &&
    sciOk &&
    (o.rxnormId === null || typeof o.rxnormId === "string") &&
    (o.dosageMg === null || typeof o.dosageMg === "string") &&
    (o.frequency === null || typeof o.frequency === "string") &&
    (o.timeToTake === null || typeof o.timeToTake === "string") &&
    (o.refillBefore === null || typeof o.refillBefore === "string") &&
    typeof o.createdAt === "string"
  );
}

export function loadActiveRegimen(): ActiveMedication[] {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (raw) {
        localStorage.setItem(STORAGE_KEY, raw);
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isActiveMedication).map((m) => ({
      ...m,
      commonName: m.commonName ?? null,
      scientificName: m.scientificName ?? null,
    }));
  } catch {
    return [];
  }
}

export function saveActiveRegimen(meds: ActiveMedication[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(meds));
  localStorage.removeItem(LEGACY_STORAGE_KEY);
}

export function upsertMedication(med: ActiveMedication): void {
  const list = loadActiveRegimen();
  const idx = list.findIndex((m) => m.id === med.id);
  if (idx >= 0) list[idx] = med;
  else list.push(med);
  saveActiveRegimen(list);
}

export function removeMedication(id: string): void {
  saveActiveRegimen(loadActiveRegimen().filter((m) => m.id !== id));
}

export function getMedicationById(id: string): ActiveMedication | undefined {
  return loadActiveRegimen().find((m) => m.id === id);
}
