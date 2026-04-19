import type { UserAddress } from "../symptomCheck/addressValidation";
import type { UsStateCode } from "../symptomCheck/usStates";
import { apiClient } from "./client";

/** Stored on `User.default_address` — matches Symptom Check `UserAddress` (ZIP as `postal_code`). */
export type UserDefaultAddressPayload = {
  street: string;
  city: string;
  state: string;
  postal_code: string;
};

/** Maps API `default_address` into Symptom Check form state. */
export function defaultAddressToUserAddress(
  a: UserDefaultAddressPayload | null | undefined,
): UserAddress {
  if (!a) {
    return { street: "", city: "", state: "", postalCode: "" };
  }
  return {
    street: a.street ?? "",
    city: a.city ?? "",
    state: (a.state as UsStateCode | "") || "",
    postalCode: a.postal_code ?? "",
  };
}

export function userAddressToDefaultPayload(addr: UserAddress): UserDefaultAddressPayload {
  return {
    street: addr.street.trim(),
    city: addr.city.trim(),
    state: typeof addr.state === "string" ? addr.state : "",
    postal_code: addr.postalCode.trim(),
  };
}

/** Symptom Check insurer id; mirrors `User.default_insurance_slug` on the server. */
export type SymptomInsuranceSlug =
  | "centene"
  | "cigna"
  | "healthnet"
  | "fidelis"
  | "unitedhealthcare"
  | "elevance"
  | "humana"
  | "bluecross"
  | "aetna"
  | "other";

export type UserProfile = {
  email: string;
  first_name: string;
  last_name: string;
  date_of_birth: string | null;
  default_address: UserDefaultAddressPayload | null;
  /** Saved Symptom Check insurer; null until the user completes intake at least once while signed in. */
  default_insurance_slug?: SymptomInsuranceSlug | null;
};

export async function fetchUserProfile(): Promise<UserProfile> {
  const { data } = await apiClient.get<UserProfile>("/auth/me/");
  return data;
}

export async function updateUserProfile(payload: {
  first_name?: string;
  last_name?: string;
  date_of_birth?: string | null;
  default_address?: UserDefaultAddressPayload | null;
  default_insurance_slug?: SymptomInsuranceSlug | null;
}): Promise<UserProfile> {
  const { data } = await apiClient.patch<UserProfile>("/auth/me/", payload);
  return data;
}
