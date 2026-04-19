/**
 * Calls Django `POST /api/medication-profile/extract/` which runs DeepSeek (OpenAI-compatible)
 * medication extraction server-side. See `api/prompts/medication_extract_system.txt` for JSON shape.
 */
import axios from "axios";
import { apiClient } from "../api/client";

const EXTRACT_PATH = "medication-profile/extract/";

export type ExtractedMedicationItem = {
  /** Lookup/display fallback from the server (scientific → common → legacy). */
  name?: string;
  common_name?: string | null;
  scientific_name?: string | null;
  rxnorm_id: string | null;
  rxnorm_source?: string | null;
};

export type MedicationExtractApiResponse = {
  id: number;
  medications_raw: string;
  extracted_medications: ExtractedMedicationItem[];
  created_at: string;
};

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { error?: unknown; detail?: unknown } | undefined;
    const msg = data?.error;
    if (typeof msg === "string" && msg.trim()) {
      return msg;
    }
    const detail = data?.detail;
    if (typeof detail === "string") return detail;
    if (status === 401) return "Please sign in again to add a medication.";
    if (status === 400) return "Enter some text describing your prescription.";
    if (status === 502) {
      return typeof msg === "string" && msg.trim()
        ? msg
        : "Medication identification is temporarily unavailable. Try again later.";
    }
    if (status === 503) {
      return (
        (typeof msg === "string" && msg.trim()) ||
        "Medication identification is not configured on the server."
      );
    }
    return err.message || `Request failed (${String(status)})`;
  }
  return err instanceof Error ? err.message : "Could not identify medication.";
}

/**
 * Sends free text to the backend; returns normalized medication rows (may be empty if none found).
 */
export async function extractMedicationsFromText(
  medicationsText: string,
): Promise<MedicationExtractApiResponse> {
  try {
    const { data } = await apiClient.post<MedicationExtractApiResponse>(EXTRACT_PATH, {
      medications_text: medicationsText.trim(),
    });
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}
