import { apiClient } from "./client";

export type BroadcastEmailResponse = {
  sent: number;
};

export async function postBroadcastEmail(payload: {
  subject?: string;
  message: string;
}): Promise<BroadcastEmailResponse> {
  const { data } = await apiClient.post<BroadcastEmailResponse>("/admin/broadcast-email/", payload);
  return data;
}
