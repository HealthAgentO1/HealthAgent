/**
 * Browser-local persistence for the Symptom Check survey flow (`/symptom-check`).
 *
 * Uses `localStorage` so progress survives refresh and returning to the app in the same
 * browser profile. Snapshots are versioned so we can migrate or invalidate stale shapes.
 *
 * When the user leaves during an in-flight LLM request, `pendingRequest` records which
 * phase was active; the UI re-sends that request on "Resume" (see `SymptomCheckPage`).
 * The resume prompt uses `shouldOfferSymptomCheckResume` (follow-up steps only).
 */
import type {
  FollowUpQuestion,
  FollowUpAnswer,
  PriceEstimatePayload,
  SymptomResultsPayload,
} from "./types";
import { validatePriceEstimatePayload } from "./validatePayloads";

/** Bump when the persisted shape changes incompatibly. */
export const SYMPTOM_CHECK_SESSION_VERSION = 4 as const;

const STORAGE_KEY = "healthos.symptom_check.session.v1";
const LEGACY_STORAGE_KEY = "healthagent.symptom_check.session.v1";

export type SymptomCheckFlowStep = "intake" | "followup" | "followup_round_2" | "results";

/** Insurer ids match `INSURANCE_OPTIONS` on the page; empty string means not yet chosen. */
export type PersistedInsuranceId = string;

export type SymptomCheckPendingRequest =
  | null
  | "followup"
  | "followup_round_2"
  | "results";

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
  /** Optional second LLM question round (see `followup_questions_round_2`). */
  secondFollowUpQuestions: FollowUpQuestion[];
  secondFollowUpAnswers: Record<string, FollowUpAnswer>;
  results: SymptomResultsPayload | null;
  pendingRequest: SymptomCheckPendingRequest;
  llmError: string | null;
  /** Django `SymptomSession.public_id` after the follow-up LLM call; required for assessment. */
  surveyBackendSessionId: string | null;
  /** Cached price LLM output; paired with `priceEstimateCacheFingerprint`. */
  priceEstimate: PriceEstimatePayload | null;
  priceEstimateCacheFingerprint: string | null;
  /** Step 1: user opted in to sending past official diagnoses to the first LLM call. */
  includePriorDiagnosesInLlm: boolean;
  /**
   * Deduped labels saved when session + manual lists were loaded (for resume replay of `followup` request).
   * Mirrors `mergedPriorOfficialDiagnosisLabels` at last persist.
   */
  priorOfficialDiagnosesSnapshot: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFlowStep(value: unknown): value is SymptomCheckFlowStep {
  return (
    value === "intake" ||
    value === "followup" ||
    value === "followup_round_2" ||
    value === "results"
  );
}

function isPending(value: unknown): value is SymptomCheckPendingRequest {
  return (
    value === null ||
    value === "followup" ||
    value === "followup_round_2" ||
    value === "results"
  );
}

function emptyAddress(): UserAddressSnapshot {
  return { street: "", city: "", state: "", postalCode: "" };
}

function parsePriorOfficialDiagnosesSnapshot(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string") continue;
    const t = x.trim();
    if (!t) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
  }
  return out;
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
 * Returns true when a snapshot represents real progress worth mirroring to storage
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

/**
 * Whether to show the "Resume your symptom check?" gate on `/symptom-check`.
 * Only follow-up rounds (not step 1 intake or step 3 results), including an in-flight
 * LLM request for those phases after leaving mid-request.
 */
export function shouldOfferSymptomCheckResume(s: SymptomCheckSessionSnapshot): boolean {
  if (s.step === "followup" || s.step === "followup_round_2") return true;
  if (s.pendingRequest === "followup" || s.pendingRequest === "followup_round_2") return true;
  return false;
}

/** v1 on-disk shape (no address block, no round-2 or backend session id). */
type LegacyV1Snapshot = {
  version: 1;
  updatedAt: string;
  step: "intake" | "followup" | "results";
  symptoms: string;
  insurance: PersistedInsuranceId;
  followUpQuestions: FollowUpQuestion[];
  followUpAnswers: Record<string, FollowUpAnswer>;
  results: SymptomResultsPayload | null;
  pendingRequest: null | "followup" | "results";
  llmError: string | null;
};

function isLegacyV1(value: unknown): value is LegacyV1Snapshot {
  if (!isRecord(value)) return false;
  if (value.version !== 1) return false;
  if (typeof value.updatedAt !== "string") return false;
  if (value.step !== "intake" && value.step !== "followup" && value.step !== "results") {
    return false;
  }
  if (typeof value.symptoms !== "string") return false;
  if (typeof value.insurance !== "string") return false;
  if (!Array.isArray(value.followUpQuestions)) return false;
  if (!isRecord(value.followUpAnswers)) return false;
  if (value.results !== null && typeof value.results !== "object") return false;
  if (
    value.pendingRequest !== null &&
    value.pendingRequest !== "followup" &&
    value.pendingRequest !== "results"
  ) {
    return false;
  }
  if (value.llmError !== null && typeof value.llmError !== "string") return false;
  return true;
}

function migrateV1ToV4(raw: LegacyV1Snapshot): SymptomCheckSessionSnapshot {
  return {
    version: SYMPTOM_CHECK_SESSION_VERSION,
    updatedAt: raw.updatedAt,
    step: raw.step,
    symptoms: raw.symptoms,
    insurance: raw.insurance,
    address: emptyAddress(),
    followUpQuestions: raw.followUpQuestions,
    followUpAnswers: raw.followUpAnswers,
    secondFollowUpQuestions: [],
    secondFollowUpAnswers: {},
    results: raw.results,
    pendingRequest: raw.pendingRequest,
    llmError: raw.llmError,
    surveyBackendSessionId: null,
    priceEstimate: null,
    priceEstimateCacheFingerprint: null,
    includePriorDiagnosesInLlm: false,
    priorOfficialDiagnosesSnapshot: [],
  };
}

/** v2: address + survey id, no second question round fields. */
function migrateV2RecordToV4(raw: Record<string, unknown>): SymptomCheckSessionSnapshot | null {
  if (raw.version !== 2) return null;
  if (typeof raw.updatedAt !== "string") return null;
  const step = raw.step;
  if (step !== "intake" && step !== "followup" && step !== "results") return null;
  if (typeof raw.symptoms !== "string") return null;
  if (typeof raw.insurance !== "string") return null;
  const addr = parseAddress(raw.address);
  if (!addr) return null;
  if (!Array.isArray(raw.followUpQuestions)) return null;
  if (!isRecord(raw.followUpAnswers)) return null;
  if (raw.results !== null && typeof raw.results !== "object") return null;
  const pr = raw.pendingRequest;
  if (pr !== null && pr !== "followup" && pr !== "results") return null;
  if (raw.llmError !== null && typeof raw.llmError !== "string") return null;

  const surveyBackendSessionId =
    typeof raw.surveyBackendSessionId === "string" && raw.surveyBackendSessionId.trim() !== ""
      ? raw.surveyBackendSessionId.trim()
      : null;

  return {
    version: SYMPTOM_CHECK_SESSION_VERSION,
    updatedAt: raw.updatedAt,
    step,
    symptoms: raw.symptoms,
    insurance: raw.insurance,
    address: addr,
    followUpQuestions: raw.followUpQuestions as FollowUpQuestion[],
    followUpAnswers: raw.followUpAnswers as Record<string, FollowUpAnswer>,
    secondFollowUpQuestions: [],
    secondFollowUpAnswers: {},
    results: raw.results as SymptomResultsPayload | null,
    pendingRequest: pr,
    llmError: raw.llmError,
    surveyBackendSessionId,
    priceEstimate: null,
    priceEstimateCacheFingerprint: null,
    includePriorDiagnosesInLlm: false,
    priorOfficialDiagnosesSnapshot: [],
  };
}

function parseStoredPriceFields(raw: Record<string, unknown>): {
  priceEstimate: PriceEstimatePayload | null;
  priceEstimateCacheFingerprint: string | null;
} {
  let priceEstimate: PriceEstimatePayload | null = null;
  if (raw.priceEstimate != null) {
    try {
      priceEstimate = validatePriceEstimatePayload(raw.priceEstimate);
    } catch {
      priceEstimate = null;
    }
  }
  const fp = raw.priceEstimateCacheFingerprint;
  const priceEstimateCacheFingerprint =
    typeof fp === "string" && fp.trim() !== "" ? fp.trim() : null;
  return { priceEstimate, priceEstimateCacheFingerprint };
}

function parseSnapshot(raw: unknown): SymptomCheckSessionSnapshot | null {
  if (!isRecord(raw)) return null;

  if (raw.version === 1) {
    return isLegacyV1(raw) ? migrateV1ToV4(raw) : null;
  }

  if (raw.version === 2) {
    return migrateV2RecordToV4(raw);
  }

  if (raw.version !== 3 && raw.version !== SYMPTOM_CHECK_SESSION_VERSION) return null;
  if (typeof raw.updatedAt !== "string") return null;
  if (!isFlowStep(raw.step)) return null;
  if (typeof raw.symptoms !== "string") return null;
  if (typeof raw.insurance !== "string") return null;
  const addr = parseAddress(raw.address);
  if (!addr) return null;
  if (!Array.isArray(raw.followUpQuestions)) return null;
  if (!isRecord(raw.followUpAnswers)) return null;
  if (!Array.isArray(raw.secondFollowUpQuestions)) return null;
  if (!isRecord(raw.secondFollowUpAnswers)) return null;
  if (raw.results !== null && typeof raw.results !== "object") return null;
  if (!isPending(raw.pendingRequest)) return null;
  if (raw.llmError !== null && typeof raw.llmError !== "string") return null;

  const surveyBackendSessionId =
    typeof raw.surveyBackendSessionId === "string" && raw.surveyBackendSessionId.trim() !== ""
      ? raw.surveyBackendSessionId.trim()
      : null;

  const { priceEstimate, priceEstimateCacheFingerprint } = parseStoredPriceFields(raw);

  const includePriorDiagnosesInLlm = raw.includePriorDiagnosesInLlm === true;
  const priorOfficialDiagnosesSnapshot = parsePriorOfficialDiagnosesSnapshot(
    raw.priorOfficialDiagnosesSnapshot,
  );

  return {
    version: SYMPTOM_CHECK_SESSION_VERSION,
    updatedAt: raw.updatedAt,
    step: raw.step,
    symptoms: raw.symptoms,
    insurance: raw.insurance,
    address: addr,
    followUpQuestions: raw.followUpQuestions as FollowUpQuestion[],
    followUpAnswers: raw.followUpAnswers as Record<string, FollowUpAnswer>,
    secondFollowUpQuestions: raw.secondFollowUpQuestions as FollowUpQuestion[],
    secondFollowUpAnswers: raw.secondFollowUpAnswers as Record<string, FollowUpAnswer>,
    results: raw.results as SymptomResultsPayload | null,
    pendingRequest: raw.pendingRequest,
    llmError: raw.llmError,
    surveyBackendSessionId,
    priceEstimate,
    priceEstimateCacheFingerprint,
    includePriorDiagnosesInLlm,
    priorOfficialDiagnosesSnapshot,
  };
}

export function readSymptomCheckSession(): SymptomCheckSessionSnapshot | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  try {
    let raw = window.localStorage.getItem(STORAGE_KEY);
    let fromLegacy = false;
    if (raw === null || raw.trim() === "") {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy === null || legacy.trim() === "") return null;
      raw = legacy;
      fromLegacy = true;
    }
    const parsed: unknown = JSON.parse(raw);
    const snapshot = parseSnapshot(parsed);
    if (snapshot && fromLegacy) {
      try {
        window.localStorage.setItem(STORAGE_KEY, raw);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch {
        /* ignore migration write failures */
      }
    }
    return snapshot;
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
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
