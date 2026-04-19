/**
 * Client-side validation for the Symptom Check “current address” block (step 1).
 * Mirrors the Django `SymptomNearbyFacilitiesSerializer` rules closely.
 */
import { isUsStateCode, type UsStateCode } from "./usStates";

export type UserAddress = {
  street: string;
  city: string;
  state: UsStateCode | "";
  postalCode: string;
};

export type UserAddressFieldErrors = Partial<Record<keyof UserAddress, string>>;

const ZIP_RE = /^\d{5}$/;

/** Basic guardrails so obviously invalid lines do not hit the backend. */
export function validateUserAddress(address: UserAddress): {
  valid: boolean;
  errors: UserAddressFieldErrors;
} {
  const errors: UserAddressFieldErrors = {};

  const street = address.street.trim();
  if (street.length < 3) {
    errors.street = "Enter a street address (at least a few characters).";
  } else if (street.length > 240) {
    errors.street = "Street address is too long.";
  }

  const city = address.city.trim();
  if (city.length < 2) {
    errors.city = "Enter a city.";
  } else if (city.length > 120) {
    errors.city = "City name is too long.";
  }

  if (!address.state) {
    errors.state = "Select a state.";
  } else if (!isUsStateCode(address.state)) {
    errors.state = "Select a valid US state.";
  }

  const zip = address.postalCode.trim();
  if (!ZIP_RE.test(zip)) {
    errors.postalCode = "ZIP must be exactly 5 digits.";
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
