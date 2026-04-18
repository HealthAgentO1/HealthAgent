import axios from "axios";
import {
  clearAuthSession,
  getRefreshToken,
  getStoredEmail,
  setAuthSession,
} from "./authStorage";

const baseURL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000/api";

export interface RegisterPayload {
  email: string;
  password: string;
  first_name?: string;
  last_name?: string;
}

export interface RegisterResponse {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface TokenResponse {
  access: string;
  refresh: string;
}

/** Plain axios for login/register (no Authorization header). */
const authApi = axios.create({
  baseURL,
  headers: { "Content-Type": "application/json" },
});

export async function registerUser(
  payload: RegisterPayload,
): Promise<RegisterResponse> {
  const { data } = await authApi.post<RegisterResponse>(
    "/auth/register/",
    payload,
  );
  return data;
}

export async function obtainTokens(
  email: string,
  password: string,
): Promise<TokenResponse> {
  const { data } = await authApi.post<TokenResponse>("/token/", {
    email,
    password,
  });
  return data;
}

export async function registerAndSignIn(
  payload: RegisterPayload,
): Promise<{ user: RegisterResponse }> {
  const user = await registerUser(payload);
  const tokens = await obtainTokens(payload.email, payload.password);
  setAuthSession(tokens.access, tokens.refresh, user.email);
  return { user };
}

export async function signIn(email: string, password: string) {
  const tokens = await obtainTokens(email, password);
  setAuthSession(tokens.access, tokens.refresh, email);
}

export function signOut() {
  clearAuthSession();
}

/** Attempt token refresh; returns new access or null. */
export async function refreshAccessToken(): Promise<string | null> {
  const refresh = getRefreshToken();
  if (!refresh) return null;
  try {
    const { data } = await authApi.post<{ access: string }>("/token/refresh/", {
      refresh,
    });
    setAuthSession(data.access, refresh, getStoredEmail() || "");
    return data.access;
  } catch {
    clearAuthSession();
    return null;
  }
}
