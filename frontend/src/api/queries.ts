import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";
import type { PostVisitDiagnosis } from "../symptomCheck/postVisitDiagnosisTypes";

// Define the shape of our provider data
export interface Provider {
  npi: string;
  name: string;
  specialty: string;
  address: string;
  distance_approx: string;
  taxonomy_code?: string;
  phone?: string;
}

// Symptom session data
export interface SymptomSession {
  id: number;
  ai_conversation_log: any[];
  triage_level: string | null;
  provider_npi: string | null;
  insurance_details: any | null;
  booking_status: string;
  pre_visit_report: any | null;
  created_at: string;
  /** Present when booking API returns a confirmation (mock or real). */
  confirmation_number?: string;
}

export interface CreateSymptomSessionData {
  insurance_details: {
    plan: string;
    provider: string;
  };
}

/** `GET /sessions/` — dashboard history cards */
export interface SymptomSessionListItem {
  session_id: string;
  triage_level: string | null;
  created_at: string;
  summary: string;
  /** Present when the symptom interview produced a structured handoff (survey or chat). */
  pre_visit_report: Record<string, unknown> | null;
  /** Clinician diagnosis recorded after a visit; marks the check complete for reporting. */
  post_visit_diagnosis?: PostVisitDiagnosis | null;
}

/** `GET /sessions/<uuid>/` — hydrate Symptom Check from a saved server session */
export interface SymptomSessionResume {
  session_id: string;
  resume_step: "intake" | "followup" | "results" | "chat";
  symptoms: string;
  insurance_label: string;
  followup_raw_text?: string;
  results_raw_text?: string;
  /** Last `price_estimate_context` survey turn, when present — avoids refetching on resume. */
  price_estimate_raw_text?: string;
  /** Step-1 US address echoed from persisted survey turns (for NPPES resume). */
  practice_location?: {
    street: string;
    city: string;
    state: string;
    postal_code: string;
  } | null;
  triage_level: string | null;
  created_at: string;
  post_visit_diagnosis?: PostVisitDiagnosis | null;
}

/** `PATCH /sessions/<uuid>/` — save official post-visit diagnosis (response body matches resume GET). */
export async function patchSymptomSessionPostVisitDiagnosis(
  sessionId: string,
  diagnosis: PostVisitDiagnosis,
): Promise<SymptomSessionResume> {
  const { data } = await apiClient.patch<SymptomSessionResume>(`/sessions/${sessionId}/`, {
    post_visit_diagnosis: diagnosis,
  });
  return data;
}

export async function fetchSymptomSessionResume(sessionId: string): Promise<SymptomSessionResume> {
  const { data } = await apiClient.get<SymptomSessionResume>(`/sessions/${sessionId}/`);
  return data;
}

const fetchSymptomSessions = async (): Promise<SymptomSessionListItem[]> => {
  const { data } = await apiClient.get<SymptomSessionListItem[]>("/sessions/");
  return data;
};

export const useSymptomSessions = (options?: { enabled?: boolean }) => {
  return useQuery({
    queryKey: ["symptom-sessions"],
    queryFn: fetchSymptomSessions,
    enabled: options?.enabled ?? true,
  });
};

export async function deleteSymptomSession(sessionId: string): Promise<void> {
  await apiClient.delete(`/sessions/${sessionId}/`);
}

export const useDeleteSymptomSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteSymptomSession,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["symptom-sessions"] });
    },
  });
};

// Example API fetcher using our Axios client
const fetchProviders = async (zip: string, specialty?: string): Promise<Provider[]> => {
  const { data } = await apiClient.get<Provider[]>("/providers/", {
    params: { zip, specialty },
  });
  return data;
};

// Create symptom session (exported for future flows; not yet wired in the UI)
export const createSymptomSession = async (
  data: CreateSymptomSessionData,
): Promise<SymptomSession> => {
  const { data: response } = await apiClient.post<SymptomSession>("/symptom-sessions/", data);
  return response;
};

// Example React Query hook that developers can adapt for their slices
export const useProviders = (zip: string, specialty?: string) => {
  return useQuery({
    queryKey: ["providers", { zip, specialty }],
    queryFn: () => fetchProviders(zip, specialty),
    enabled: !!zip, // Only run the query if a zip code is provided
  });
};

