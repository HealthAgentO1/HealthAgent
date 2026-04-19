import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "./client";

export interface ManualPriorDiagnosisItem {
  diagnosis_id: string;
  text: string;
  created_at: string;
}

export const manualPriorDiagnosesQueryKey = ["manual-prior-diagnoses"] as const;

export async function fetchManualPriorDiagnoses(): Promise<ManualPriorDiagnosisItem[]> {
  const { data } = await apiClient.get<ManualPriorDiagnosisItem[]>("/prior-diagnoses/");
  return data;
}

export function useManualPriorDiagnoses(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: manualPriorDiagnosesQueryKey,
    queryFn: fetchManualPriorDiagnoses,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateManualPriorDiagnosis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => {
      const { data } = await apiClient.post<ManualPriorDiagnosisItem>("/prior-diagnoses/", {
        text,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: manualPriorDiagnosesQueryKey });
    },
  });
}

export function useDeleteManualPriorDiagnosis() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (diagnosisId: string) => {
      await apiClient.delete(`/prior-diagnoses/${diagnosisId}/`);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: manualPriorDiagnosesQueryKey });
    },
  });
}
