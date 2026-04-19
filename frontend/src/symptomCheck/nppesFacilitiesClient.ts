/**
 * Symptom Check: POSTs address + taxonomy + optional `insurer_slug` to Django
 * `POST /api/symptom/nearby-facilities/` (JWT on `apiClient`), which proxies NPPES + Census geocoding.
 *
 * Mirrors `symptomLlmClient.ts`: server-only upstream calls, typed JSON response.
 */
import axios from "axios";
import { apiClient } from "../api/client";

const NEARBY_FACILITIES_PATH = "symptom/nearby-facilities/";

/** Symptom Check insurer keys accepted by `POST /api/symptom/nearby-facilities/`. */
export type SymptomInsurerSlug =
  | "centene"
  | "cigna"
  | "healthnet"
  | "fidelis"
  | "unitedhealthcare"
  | "elevance"
  | "humana"
  | "other";

export type NearbyFacilitiesRequest = {
  street: string;
  city: string;
  state: string;
  postal_code: string;
  taxonomy_codes: string[];
  /** From LLM `care_taxonomy`; server uses this to order facility types (e.g. hospital first for ED). */
  suggested_care_setting: string;
  /** When set, Django may annotate each row with `in_network` from offline-ingested TIC rows (not eligibility). */
  insurer_slug?: SymptomInsurerSlug;
};

export type NearbyFacility = {
  npi: string;
  name: string;
  address_line: string;
  distance_miles: number;
  distance_label: string;
  taxonomy_code: string | null;
  taxonomy_description: string | null;
  /** Heuristic 0+ from NPPES name/taxonomy/org signals (no public reviews in registry). */
  relevance_score: number;
  /** Present when request included `insurer_slug`; coarse match from posted payer files (not eligibility). */
  in_network?: boolean | null;
};

export type NearbyFacilitiesPayload = {
  facilities: NearbyFacility[];
  taxonomy_used: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNearbyFacility(value: unknown): value is NearbyFacility {
  if (!isRecord(value)) return false;
  if (typeof value.npi !== "string" || !/^\d{10}$/.test(value.npi)) return false;
  if (typeof value.name !== "string" || value.name.trim().length === 0) return false;
  if (typeof value.address_line !== "string" || value.address_line.trim().length === 0) {
    return false;
  }
  if (typeof value.distance_miles !== "number" || !Number.isFinite(value.distance_miles)) {
    return false;
  }
  if (typeof value.distance_label !== "string" || value.distance_label.trim().length === 0) {
    return false;
  }
  if (value.taxonomy_code !== null && typeof value.taxonomy_code !== "string") return false;
  if (value.taxonomy_description !== null && typeof value.taxonomy_description !== "string") {
    return false;
  }
  if (typeof value.relevance_score !== "number" || !Number.isFinite(value.relevance_score)) {
    return false;
  }
  if ("in_network" in value) {
    const inn = value.in_network;
    if (inn !== null && inn !== undefined && typeof inn !== "boolean") {
      return false;
    }
  }
  return true;
}

function coercePayload(value: unknown): NearbyFacilitiesPayload {
  if (!isRecord(value)) {
    throw new Error("Nearby facilities response was not a JSON object.");
  }
  const facilitiesRaw = value.facilities;
  if (!Array.isArray(facilitiesRaw)) {
    throw new Error("Nearby facilities response missing facilities array.");
  }
  const facilities: NearbyFacility[] = [];
  for (const row of facilitiesRaw) {
    if (!isNearbyFacility(row)) {
      throw new Error("Nearby facilities response contained an invalid row.");
    }
    const inn = row.in_network;
    facilities.push({
      ...row,
      in_network: inn === true || inn === false ? inn : null,
    });
  }
  const taxonomy_used = value.taxonomy_used;
  if (taxonomy_used !== null && typeof taxonomy_used !== "string") {
    throw new Error("Nearby facilities response had invalid taxonomy_used.");
  }
  return { facilities, taxonomy_used: taxonomy_used ?? null };
}

function getNearbyFacilitiesErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const status = err.response?.status;
    if (status === 401) {
      return "Please sign in to load nearby facilities.";
    }
    const data = err.response?.data as { detail?: unknown } | undefined;
    const detail = data?.detail;
    if (typeof detail === "string" && detail.trim().length > 0) {
      return detail;
    }
    return err.message || `Request failed (${String(status)})`;
  }
  return err instanceof Error ? err.message : "Unable to load nearby facilities.";
}

export async function requestNearbyFacilities(
  body: NearbyFacilitiesRequest,
): Promise<NearbyFacilitiesPayload> {
  try {
    const { data } = await apiClient.post<unknown>(NEARBY_FACILITIES_PATH, body);
    return coercePayload(data);
  } catch (err) {
    throw new Error(getNearbyFacilitiesErrorMessage(err));
  }
}

export function buildGoogleMapsUrl(addressLine: string): string {
  const q = encodeURIComponent(addressLine.trim());
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}
