/**
 * Browser-local persistence for the Symptom Check survey flow (`/symptom-check`).
 *
 * Uses `localStorage` so progress survives refresh and returning to the app in the same
 * browser profile. Snapshots are versioned so we can migrate or invalidate stale shapes.
 *
 * When the user leaves during an in-flight LLM request, `pendingRequest` records which
 * phase was active; the UI re-sends that request on "Resume" (see `SymptomCheckPage`).
 */
import type { FollowUpQuestion, FollowUpAnswer, SymptomResultsPayload } from "./types";

/** Bump when the persisted shape changes incompatibly. */
export const SYMPTOM_CHECK_SESSION_VERSION = 2 as const;

const STORAGE_KEY = "healthagent.symptom_check.session.v1";

export type SymptomCheckFlowStep = "intake" | "followup" | "results";

/** Insurer ids match `INSURANCE_OPTIONS` on the page; empty string means not yet chosen. */
export type PersistedInsuranceId = string;

export type SymptomCheckPendingRequest = null | "followup" | "results";

/** Saved step-1 address for NPPES + geocoding on the results step. */
export type UserAddressSnapshot = {
  street: string;
  city: string;
  state: string;
  postalCode: string;
};

export type SymptomCheckSessionSnapshot = {
  version: typeof SYMPTOM_CHECK_SESSION_VERSION;
  updatedAt: string;
  step: SymptomCheckFlowStep;
  symptoms: string;
  insurance: PersistedInsuranceId;
  /** US address used to rank nearby facilities (NPPES + Census). */
  address: UserAddressSnapshot;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, FollowUpAnswer>;
  results: SymptomResultsPayload | null;
  pendingRequest: SymptomCheckPendingRequest;
  llmError: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFlowStep(value: unknown): value is SymptomCheckFlowStep {
  return value === "intake" || value === "followup" || value === "results";
}

function isPending(value: unknown): value is SymptomCheckPendingRequest {
  return value === null || value === "followup" || value === "results";
}

function emptyAddress(): UserAddressSnapshot {
  return { street: "", city: "", state: "", postalCode: "" };
}

function parseAddress(raw: unknown): UserAddressSnapshot | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.street !== "string") return null;
  if (typeof raw.city !== "string") return null;
  if (typeof raw.state !== "string") return null;
  if (typeof raw.postalCode !== "string") return null;
  return {
    street: raw.street,
    city: raw.city,
    state: raw.state,
    postalCode: raw.postalCode,
  };
}

/**
 * Returns true when a snapshot represents real progress worth offering "Resume"
 * (anything beyond a pristine empty intake).
 */
export function isRecoverableSymptomCheckSession(s: SymptomCheckSessionSnapshot): boolean {
  if (s.pendingRequest) return true;
  if (s.step !== "intake") return true;
  if (s.symptoms.trim().length > 0) return true;
  if (s.insurance !== "") return true;
  const a = s.address;
  if (a.street.trim() || a.city.trim() || a.state.trim() || a.postalCode.trim()) return true;
  return false;
}

type LegacyV1Snapshot = {
  version: 1;
  updatedAt: string;
  step: SymptomCheckFlowStep;
  symptoms: string;
  insurance: PersistedInsuranceId;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, FollowUpAnswer>;
  results: SymptomResultsPayload | null;
  pendingRequest: SymptomCheckPendingRequest;
  llmError: string | null;
};

function isLegacyV1(value: unknown): value is LegacyV1Snapshot {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.updatedAt !== "string") return false;
  if (!isFlowStep(value.step)) return false;
  if (typeof value.symptoms !== "string") return false;
  if (typeof value.insurance !== "string") return false;
  if (!Array.isArray(value.followUpQuestions)) return false;
  if (!isRecord(value.followUpAnswers)) return false;
  if (value.results !== null && typeof value.results !== "object") return false;
  if (!isPending(value.pendingRequest)) return false;
  if (value.llmError !== null && typeof value.llmError !== "string") return false;
  return true;
}

function migrateV1ToV2(raw: LegacyV1Snapshot): SymptomCheckSessionSnapshot {
  return {
    version: SYMPTOM_CHECK_SESSION_VERSION,
    updatedAt: raw.updatedAt,
    step: raw.step,
    symptoms: raw.symptoms,
    insurance: raw.insurance,
    address: emptyAddress(),
    followUpQuestions: raw.followUpQuestions,
    followUpAnswers: raw.followUpAnswers,
    results: raw.results,
    pendingRequest: raw.pendingRequest,
    llmError: raw.llmError,
  };
}

function parseSnapshot(raw: unknown): SymptomCheckSessionSnapshot | null {
  if (!isRecord(raw)) return null;

  if (raw.version === 1) {
    return isLegacyV1(raw) ? migrateV1ToV2(raw) : null;
  }

  if (raw.version !== SYMPTOM_CHECK_SESSION_VERSION) return null;
  if (typeof raw.updatedAt !== "string") return null;
  if (!isFlowStep(raw.step)) return null;
  if (typeof raw.symptoms !== "string") return null;
  if (typeof raw.insurance !== "string") return null;
  const addr = parseAddress(raw.address);
  if (!addr) return null;
  if (!Array.isArray(raw.followUpQuestions)) return null;
  if (!isRecord(raw.followUpAnswers)) return null;
  if (raw.results !== null && typeof raw.results !== "object") return null;
  if (!isPending(raw.pendingRequest)) return null;
  if (raw.llmError !== null && typeof raw.llmError !== "string") return null;

  return {
    version: SYMPTOM_CHECK_SESSION_VERSION,
    updatedAt: raw.updatedAt,
    step: raw.step,
    symptoms: raw.symptoms,
    insurance: raw.insurance,
    address: addr,
    followUpQuestions: raw.followUpQuestions as FollowUpQuestion[],
    followUpAnswers: raw.followUpAnswers as Record<string, FollowUpAnswer>,
    results: raw.results as SymptomResultsPayload | null,
    pendingRequest: raw.pendingRequest,
    llmError: raw.llmError,
  };
}

export function readSymptomCheckSession(): SymptomCheckSessionSnapshot | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null || raw.trim() === "") return null;
    const parsed: unknown = JSON.parse(raw);
    return parseSnapshot(parsed);
  } catch {
    return null;
  }
}

export function writeSymptomCheckSession(snapshot: SymptomCheckSessionSnapshot): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Quota or private mode — survey can still run without persistence.
  }
}

export function clearSymptomCheckSession(): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
