import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  registerAndSignIn,
  refreshAccessToken,
  signIn,
  signOut,
  type RegisterPayload,
} from "../api/auth";
import {
  clearAuthSession,
  getAccessToken,
  getRefreshToken,
  getStoredEmail,
} from "../api/authStorage";
import { isAccessTokenValid } from "../utils/jwtAccess";

type AuthContextValue = {
  isAuthenticated: boolean;
  email: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (payload: RegisterPayload) => Promise<void>;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [email, setEmail] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      const access = getAccessToken();
      const refresh = getRefreshToken();

      if (!access) {
        if (!cancelled) {
          setEmail(null);
          setReady(true);
        }
        return;
      }

      if (isAccessTokenValid(access)) {
        if (!cancelled) {
          setEmail(getStoredEmail());
          setReady(true);
        }
        return;
      }

      if (refresh) {
        const newAccess = await refreshAccessToken();
        if (cancelled) return;
        if (newAccess) {
          setEmail(getStoredEmail());
        } else {
          setEmail(null);
        }
      } else {
        clearAuthSession();
        if (!cancelled) setEmail(null);
      }
      if (!cancelled) setReady(true);
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (e: string, password: string) => {
    await signIn(e, password);
    setEmail(e);
  }, []);

  const register = useCallback(async (payload: RegisterPayload) => {
    const { user } = await registerAndSignIn(payload);
    setEmail(user.email);
  }, []);

  const logout = useCallback(() => {
    signOut();
    setEmail(null);
  }, []);

  const value = useMemo(() => {
    const token = typeof window !== "undefined" ? getAccessToken() : null;
    // After bootstrap, a stored token is either valid or freshly refreshed; mid-session
    // expiry is handled by the apiClient 401 interceptor (refresh or logout).
    return {
      isAuthenticated: ready && !!token,
      email: email ?? getStoredEmail(),
      ready,
      login,
      register,
      logout,
    };
  }, [email, ready, login, register, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
