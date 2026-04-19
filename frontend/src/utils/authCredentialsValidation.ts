/**
 * Client-side checks for login / register forms (inline UI). The API remains authoritative.
 * Keep max lengths in sync with `users/constants.py`.
 */

export const CREDENTIAL_LIMITS = {
  emailMax: 128,
  passwordMax: 64,
  passwordMin: 8,
  firstNameMax: 40,
  lastNameMax: 40,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(value: string): boolean {
  const v = value.trim();
  if (!v || v.length > CREDENTIAL_LIMITS.emailMax) return false;
  return EMAIL_RE.test(v);
}

export function loginFormCanSubmit(email: string, password: string): boolean {
  return isValidEmailFormat(email) && password.length > 0;
}

export function registerFormCanSubmit(
  firstName: string,
  lastName: string,
  email: string,
  password: string,
): boolean {
  const f = firstName.trim();
  const l = lastName.trim();
  const e = email.trim();
  return (
    f.length > 0 &&
    f.length <= CREDENTIAL_LIMITS.firstNameMax &&
    l.length > 0 &&
    l.length <= CREDENTIAL_LIMITS.lastNameMax &&
    isValidEmailFormat(email) &&
    e.length <= CREDENTIAL_LIMITS.emailMax &&
    password.length >= CREDENTIAL_LIMITS.passwordMin &&
    password.length <= CREDENTIAL_LIMITS.passwordMax
  );
}
