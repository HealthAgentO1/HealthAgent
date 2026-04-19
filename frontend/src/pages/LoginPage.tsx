import { useState, type FormEvent } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { isAxiosError } from "axios";
import { getBroadcastEligibility } from "../api/broadcastEligibility";
import { useAuth } from "../context/AuthContext";
import {
  CREDENTIAL_LIMITS,
  isValidEmailFormat,
  loginFormCanSubmit,
} from "../utils/authCredentialsValidation";
import { flattenDrfError } from "../utils/drfValidationErrors";

const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as { from?: string } | undefined;
  const redirectTo =
    state?.from &&
    state.from !== "/login" &&
    state.from !== "/register"
      ? state.from
      : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [passwordBlurred, setPasswordBlurred] = useState(false);

  const emailError =
    emailBlurred && !email.trim()
      ? "Enter your email."
      : emailBlurred && email.trim().length > CREDENTIAL_LIMITS.emailMax
        ? `Email must be at most ${CREDENTIAL_LIMITS.emailMax} characters.`
        : emailBlurred && !isValidEmailFormat(email)
          ? "Enter a valid email address."
          : null;

  const passwordError =
    passwordBlurred && password.length === 0 ? "Enter your password." : null;

  const canSubmit = loginFormCanSubmit(email, password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!loginFormCanSubmit(email, password)) {
      setEmailBlurred(true);
      setPasswordBlurred(true);
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      try {
        const { eligible } = await getBroadcastEligibility();
        if (eligible) {
          navigate("/admin/broadcast", { replace: true });
          return;
        }
      } catch {
        /* ignore — proceed to app if eligibility check fails */
      }
      navigate(redirectTo, { replace: true });
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
        const msg = flattenDrfError(err.response.data);
        setError(msg ?? "Could not sign in. Verify your credentials and try again.");
      } else {
        setError("Network error. Is the API running?");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-12">
      <div className="w-full max-w-md rounded-2xl bg-surface-container-lowest shadow-[0_8px_32px_rgba(24,28,32,0.08)] border border-outline-variant/40 p-8">
        <div className="flex items-center gap-3 mb-8">
          <img
            src="/icon.png"
            alt=""
            width={44}
            height={44}
            className="w-11 h-11 rounded-xl object-contain shadow-[0_4px_12px_rgba(24,28,32,0.12)] shrink-0"
          />
          <div>
            <h1 className="text-xl font-extrabold text-primary font-headline">
              Sign in
            </h1>
            <p className="text-sm text-on-surface-variant font-medium">
              HealthOS
            </p>
          </div>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 font-body">
          {error && (
            <div
              className="rounded-lg bg-error-container text-on-error-container text-sm px-3 py-2 border border-error/20"
              role="alert"
            >
              {error}
            </div>
          )}
          <div>
            <label
              htmlFor="login-email"
              className="block text-sm font-semibold text-on-surface mb-1"
            >
              Email
            </label>
            <input
              id="login-email"
              type="text"
              inputMode="email"
              autoComplete="email"
              maxLength={CREDENTIAL_LIMITS.emailMax}
              aria-invalid={Boolean(emailError)}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailBlurred(true)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary-container"
            />
            {emailError ? (
              <p className="mt-1 text-xs text-error font-body" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="block text-sm font-semibold text-on-surface mb-1"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              aria-invalid={Boolean(passwordError)}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordBlurred(true)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
            />
            {passwordError ? (
              <p className="mt-1 text-xs text-error font-body" role="alert">
                {passwordError}
              </p>
            ) : null}
          </div>
          <button
            type="submit"
            disabled={submitting || !canSubmit}
            className="mt-2 w-full rounded-lg bg-primary-container py-3 font-headline font-bold text-white hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer transition-opacity"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          No account?{" "}
          <Link
            to="/register"
            className="font-semibold text-primary hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
