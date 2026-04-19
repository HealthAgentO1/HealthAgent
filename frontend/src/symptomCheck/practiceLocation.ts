import { isUsStateCode, type UsStateCode } from './usStates';
import {
  validateUserAddress,
  type UserAddress,
} from './addressValidation';

/** Shape stored in survey `user_payload` / `GET /sessions/:id/` resume. */
export type PracticeLocationPayload = {
  street: string;
  city: string;
  state: string;
  postal_code: string;
};

export function practiceLocationPayloadFromUserAddress(
  address: UserAddress,
): PracticeLocationPayload | null {
  const { valid } = validateUserAddress(address);
  if (!valid) return null;
  return {
    street: address.street.trim(),
    city: address.city.trim(),
    state: address.state,
    postal_code: address.postalCode.trim(),
  };
}

function normalizePostalCodeFive(raw: unknown): string {
  if (typeof raw === 'number' && Number.isFinite(raw) && raw >= 0) {
    const s = String(Math.trunc(raw));
    if (s.length > 5) return '';
    return s.padStart(5, '0');
  }
  if (typeof raw !== 'string') return '';
  let s = raw.trim();
  if (!s) return '';
  if (s.includes('-')) s = s.split('-', 1)[0]?.trim() ?? '';
  const digits = s.replace(/\D/g, '');
  if (digits.length >= 5) return digits.slice(0, 5);
  if (digits.length > 0) return digits.padStart(5, '0');
  return '';
}

/** Restore step-1 address from server resume JSON (snake_case). */
export function userAddressFromResumePracticeLocation(
  raw: unknown,
): UserAddress | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const street = typeof o.street === 'string' ? o.street.trim() : '';
  const city = typeof o.city === 'string' ? o.city.trim() : '';
  const stateStr =
    typeof o.state === 'string' ? o.state.trim().toUpperCase() : '';
  const postalCode = normalizePostalCodeFive(o.postal_code);
  const state: UsStateCode | '' = isUsStateCode(stateStr) ? stateStr : '';
  const candidate: UserAddress = { street, city, state, postalCode };
  const { valid } = validateUserAddress(candidate);
  return valid ? candidate : null;
}
