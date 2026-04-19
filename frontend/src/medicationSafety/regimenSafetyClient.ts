/**
 * POST /api/medication/regimen-safety/ — openFDA label + recall analysis for the active regimen.
 */
import axios from "axios";
import { apiClient } from "../api/client";
import type { ActiveMedication } from "./types";

const PATH = "medication/regimen-safety/";

export type PairwiseInteractionRow = {
  drug_a: string;
  drug_b: string;
  has_interaction: boolean;
  severity: string | null;
  description: string;
  direction: string | null;
};

/** How the SPL label was matched on openFDA (generic_name vs brand_name). */
export type LabelQueryMeta = {
  field: "generic_name" | "brand_name";
  term: string;
};

export type PerDrugLabelSafety = {
  drug: string;
  /** Display token (matched term when a label was found). */
  search_term: string;
  /** Field + term that succeeded, when ``label_found`` is true. */
  label_query?: LabelQueryMeta | null;
  label_found: boolean;
  sections: Record<string, string>;
  openfda?: unknown;
};

export type InteractionResultsPayload = {
  source: string;
  label_url?: string;
  severity_scale?: string;
  pairwise: PairwiseInteractionRow[];
  per_drug_label_safety: PerDrugLabelSafety[];
  per_drug_notes: { drug: string; term: string; note: string }[];
  pairs_checked: number;
  error?: string;
};

export type RecallLookupError = {
  medication?: string;
  detail?: string;
};

export type RegimenSafetyResponse = {
  interaction_results: InteractionResultsPayload;
  recalls: {
    medications_checked: string[];
    recalls: Array<Record<string, unknown>>;
    errors: RecallLookupError[];
  };
  safety_score: {
    level: string;
    numeric: number;
    factors: Record<string, number>;
    summary: string;
  };
};

function regimenPayload(regimen: ActiveMedication[]) {
  return {
    medications: regimen.map((m) => ({
      name: m.name,
      rxnorm_id: m.rxnormId ?? undefined,
      scientific_name: m.scientificName?.trim() || undefined,
      common_name: m.commonName?.trim() || undefined,
    })),
  };
}

function extractErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    const data = err.response?.data as { error?: unknown } | undefined;
    const msg = data?.error;
    if (typeof msg === "string" && msg.trim()) {
      return msg.trim();
    }
    if (status === 401) return "Please sign in again to load safety information.";
    if (status === 502) {
      return "Safety check is temporarily unavailable. Try again later.";
    }
    return err.message || `Request failed (${String(status)})`;
  }
  return err instanceof Error ? err.message : "Could not load regimen safety data.";
}

export async function fetchRegimenSafety(regimen: ActiveMedication[]): Promise<RegimenSafetyResponse> {
  try {
    const { data } = await apiClient.post<RegimenSafetyResponse>(PATH, regimenPayload(regimen));
    return data;
  } catch (err) {
    throw new Error(extractErrorMessage(err));
  }
}
