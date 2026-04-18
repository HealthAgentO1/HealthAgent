import { useMutation, useQuery } from "@tanstack/react-query";
import { apiClient } from "./client";

// Define the shape of our provider data
export interface Provider {
  npi: string;
  name: string;
  specialty: string;
  address: string;
  distance_approx: string;
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

/** `GET /sessions/` — dashboard history cards */
export interface SymptomSessionListItem {
  session_id: string;
  triage_level: string | null;
  created_at: string;
  summary: string;
}

/** `GET /sessions/<uuid>/` — hydrate Symptom Check from a saved server session */
export interface SymptomSessionResume {
  session_id: string;
  resume_step: "intake" | "followup" | "results" | "chat";
  symptoms: string;
  insurance_label: string;
  followup_raw_text?: string;
  results_raw_text?: string;
  triage_level: string | null;
  created_at: string;
}

export async function fetchSymptomSessionResume(sessionId: string): Promise<SymptomSessionResume> {
  const { data } = await apiClient.get<SymptomSessionResume>(`/sessions/${sessionId}/`);
  return data;
}

const fetchSymptomSessions = async (): Promise<SymptomSessionListItem[]> => {
  const { data } = await apiClient.get<SymptomSessionListItem[]>("/sessions/");
  return data;
};

export const useSymptomSessions = () => {
  return useQuery({
    queryKey: ["symptom-sessions"],
    queryFn: fetchSymptomSessions,
  });
};

// Example API fetcher using our Axios client
const fetchProviders = async (zip: string, specialty?: string): Promise<Provider[]> => {
  const { data } = await apiClient.get<Provider[]>("/providers/", {
    params: { zip, specialty },
  });
  return data;
};

// Example React Query hook that developers can adapt for their slices
export const useProviders = (zip: string, specialty?: string) => {
  return useQuery({
    queryKey: ["providers", { zip, specialty }],
    queryFn: () => fetchProviders(zip, specialty),
    enabled: !!zip, // Only run the query if a zip code is provided
  });
};

// Book appointment for a symptom session
const bookAppointment = async (sessionId: number): Promise<SymptomSession> => {
  const { data } = await apiClient.post<SymptomSession>(`/symptom-sessions/${sessionId}/book/`);
  return data;
};

// Hook for booking appointments
export const useBookAppointment = () => {
  return useMutation({
    mutationFn: bookAppointment,
  });
};
