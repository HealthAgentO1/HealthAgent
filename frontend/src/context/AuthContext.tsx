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
  signIn,
  signOut,
  type RegisterPayload,
} from "../api/auth";
import { getAccessToken, getStoredEmail } from "../api/authStorage";

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
    if (getAccessToken()) {
      setEmail(getStoredEmail());
    } else {
      setEmail(null);
    }
    setReady(true);
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
