const ACCESS = "access_token";
const REFRESH = "refresh_token";
const EMAIL = "user_email";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH);
}

export function getStoredEmail(): string | null {
  return localStorage.getItem(EMAIL);
}

export function setAuthSession(access: string, refresh: string, email: string) {
  localStorage.setItem(ACCESS, access);
  localStorage.setItem(REFRESH, refresh);
  localStorage.setItem(EMAIL, email);
}

export function clearAuthSession() {
  localStorage.removeItem(ACCESS);
  localStorage.removeItem(REFRESH);
  localStorage.removeItem(EMAIL);
}
