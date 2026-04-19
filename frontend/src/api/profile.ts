import { apiClient } from "./client";

export type UserProfile = {
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
};

export async function fetchUserProfile(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>("/auth/me/");
  return data;
}

export async function updateUserProfile(payload: {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
}): Promise<UserProfile> {
  const { data } = await apiClient.patch<UserProfile>("/auth/me/", payload);
  return data;
}
