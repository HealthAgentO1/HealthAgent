/**
 * Client-side checks for login / register forms (inline UI). The API remains authoritative.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
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
  return (
    firstName.trim().length > 0 &&
    lastName.trim().length > 0 &&
    isValidEmailFormat(email) &&
    password.length >= 8
  );
}
