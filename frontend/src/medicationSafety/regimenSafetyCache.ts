/**
 * Session-scoped cache for openFDA regimen safety responses.
 * Invalidates when the regimen **identity** changes (add/remove/rename/RxNorm/common/scientific),
 * not when optional fields like dosage change. Scoped to the signed-in account so switching
 * users in the same tab does not reuse another account’s cache.
 */
import { getStoredEmail } from "../api/authStorage";
import type { ActiveMedication } from "./types";
import { fetchRegimenSafety, type RegimenSafetyResponse } from "./regimenSafetyClient";

const STORAGE_KEY = "healthagent_regimen_safety_cache_v2";

/** In-flight regimen-safety fetches keyed by fingerprint (dedupes list + detail mounting together). */
const pendingByFingerprint = new Map<string, Promise<RegimenSafetyResponse>>();

type CacheEnvelope = {
  /** Lowercased email; must match current session for a hit. */
  accountEmail: string;
  fingerprint: string;
  data: RegimenSafetyResponse;
};

function currentAccountKey(): string {
  return getStoredEmail()?.trim().toLowerCase() ?? "";
}

/** Stable identity for which medications are in the regimen (order-independent). */
export function regimenIdentityFingerprint(regimen: ActiveMedication[]): string {
  const rows = [...regimen]
    .map((m) => ({
      id: m.id,
      name: m.name.trim(),
      rxnormId: m.rxnormId,
      scientificName: m.scientificName,
      commonName: m.commonName,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify(rows);
}

export function readCachedRegimenSafety(fingerprint: string): RegimenSafetyResponse | null {
  try {
    const account = currentAccountKey();
    if (!account) {
      return null;
    }
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as CacheEnvelope;
    if (parsed.accountEmail !== account || parsed.fingerprint !== fingerprint) {
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCachedRegimenSafety(fingerprint: string, data: RegimenSafetyResponse): void {
  try {
    const account = currentAccountKey();
    if (!account) {
      return;
    }
    const env: CacheEnvelope = { accountEmail: account, fingerprint, data };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(env));
  } catch {
    // Quota or private mode — ignore; network path still works.
  }
}

/**
 * Returns cached openFDA payload when the fingerprint matches; otherwise fetches and stores.
 */
export async function loadRegimenSafetyCached(regimen: ActiveMedication[]): Promise<RegimenSafetyResponse> {
  const fp = regimenIdentityFingerprint(regimen);
  const hit = readCachedRegimenSafety(fp);
  if (hit) {
    return hit;
  }
  const existing = pendingByFingerprint.get(fp);
  if (existing) {
    return existing;
  }
  const pending = fetchRegimenSafety(regimen)
    .then((data) => {
      writeCachedRegimenSafety(fp, data);
      return data;
    })
    .finally(() => {
      pendingByFingerprint.delete(fp);
    });
  pendingByFingerprint.set(fp, pending);
  return pending;
}
