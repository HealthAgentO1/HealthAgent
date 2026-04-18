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
export const SYMPTOM_CHECK_SESSION_VERSION = 1 as const;

const STORAGE_KEY = "healthagent.symptom_check.session.v1";

export type SymptomCheckFlowStep = "intake" | "followup" | "results";

/** Insurer ids match `INSURANCE_OPTIONS` on the page; empty string means not yet chosen. */
export type PersistedInsuranceId = string;

export type SymptomCheckPendingRequest = null | "followup" | "results";

export type SymptomCheckSessionSnapshot = {
  version: typeof SYMPTOM_CHECK_SESSION_VERSION;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFlowStep(value: unknown): value is SymptomCheckFlowStep {
  return value === "intake" || value === "followup" || value === "results";
}

function isPending(value: unknown): value is SymptomCheckPendingRequest {
  return value === null || value === "followup" || value === "results";
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
  return false;
}

function parseSnapshot(raw: unknown): SymptomCheckSessionSnapshot | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== SYMPTOM_CHECK_SESSION_VERSION) return null;
  if (typeof raw.updatedAt !== "string") return null;
  if (!isFlowStep(raw.step)) return null;
  if (typeof raw.symptoms !== "string") return null;
  if (typeof raw.insurance !== "string") return null;
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
