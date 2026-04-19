import { apiClient } from "./client";

export type BroadcastEligibilityResponse = {
  eligible: boolean;
  configured: boolean;
};

export async function getBroadcastEligibility(): Promise<BroadcastEligibilityResponse> {
  const { data } = await apiClient.get<BroadcastEligibilityResponse>("/admin/broadcast-eligibility/");
  return data;
}
