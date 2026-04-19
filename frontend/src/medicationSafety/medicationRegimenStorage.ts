import { getStoredEmail } from "../api/authStorage";
import type { ActiveMedication } from "./types";

/** Per signed-in user (email). Unscoped v1 keys are legacy only. */
const STORAGE_PREFIX = "healthos_active_regimen_v2:";
const LEGACY_UNSCOPED_KEYS = ["healthos_active_regimen_v1", "healthagent_active_regimen_v1"] as const;

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

function normalizedAccountEmail(): string | null {
  const e = getStoredEmail()?.trim().toLowerCase();
  return e && e.length > 0 ? e : null;
}

function regimenStorageKeyForEmail(email: string): string {
  return `${STORAGE_PREFIX}${email}`;
}

/** True if another local account (different email bucket) already has saved meds. */
function otherAccountsHaveRegimenData(currentEmail: string): boolean {
  const currentKey = regimenStorageKeyForEmail(currentEmail);
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(STORAGE_PREFIX) || k === currentKey) continue;
    const raw = localStorage.getItem(k);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) continue;
      const meds = parsed.filter(isActiveMedication);
      if (meds.length > 0) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

function removeLegacyUnscopedKeys(): void {
  for (const lk of LEGACY_UNSCOPED_KEYS) {
    localStorage.removeItem(lk);
  }
}

/**
 * Old builds stored one regimen for the whole browser. Migrate into the current account only
 * when no other account already has isolated data (avoids assigning shared data to the wrong user).
 */
function migrateLegacyUnscopedIfAppropriate(targetKey: string, currentEmail: string): void {
  if (otherAccountsHaveRegimenData(currentEmail)) {
    removeLegacyUnscopedKeys();
    return;
  }
  for (const lk of LEGACY_UNSCOPED_KEYS) {
    const raw = localStorage.getItem(lk);
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        localStorage.removeItem(lk);
        continue;
      }
      const meds = parsed.filter(isActiveMedication).map((m) => ({
        ...m,
        commonName: m.commonName ?? null,
        scientificName: m.scientificName ?? null,
      }));
      if (meds.length === 0) {
        localStorage.removeItem(lk);
        continue;
      }
      localStorage.setItem(targetKey, JSON.stringify(meds));
      removeLegacyUnscopedKeys();
      return;
    } catch {
      localStorage.removeItem(lk);
    }
  }
}

function parseRegimenRaw(raw: string): ActiveMedication[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isActiveMedication).map((m) => ({
    ...m,
    commonName: m.commonName ?? null,
    scientificName: m.scientificName ?? null,
  }));
}

export function loadActiveRegimen(): ActiveMedication[] {
  try {
    const email = normalizedAccountEmail();
    if (!email) return [];

    const key = regimenStorageKeyForEmail(email);
    migrateLegacyUnscopedIfAppropriate(key, email);

    const raw = localStorage.getItem(key);
    if (!raw) return [];
    return parseRegimenRaw(raw);
  } catch {
    return [];
  }
}

export function saveActiveRegimen(meds: ActiveMedication[]): void {
  const email = normalizedAccountEmail();
  if (!email) return;
  const key = regimenStorageKeyForEmail(email);
  localStorage.setItem(key, JSON.stringify(meds));
  removeLegacyUnscopedKeys();
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
