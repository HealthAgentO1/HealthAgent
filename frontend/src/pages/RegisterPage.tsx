import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { isAxiosError } from "axios";
import { isValidEmailFormat, registerFormCanSubmit } from "../utils/authCredentialsValidation";

const RegisterPage = () => {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [firstBlurred, setFirstBlurred] = useState(false);
  const [lastBlurred, setLastBlurred] = useState(false);
  const [emailBlurred, setEmailBlurred] = useState(false);
  const [passwordBlurred, setPasswordBlurred] = useState(false);

  const firstError =
    firstBlurred && !firstName.trim() ? "Enter your first name." : null;
  const lastError = lastBlurred && !lastName.trim() ? "Enter your last name." : null;

  const emailError =
    emailBlurred && !email.trim()
      ? "Enter your email."
      : emailBlurred && !isValidEmailFormat(email)
        ? "Enter a valid email address."
        : null;

  const passwordError =
    passwordBlurred && password.length < 8
      ? "Password must be at least 8 characters."
      : null;

  const canSubmit = registerFormCanSubmit(firstName, lastName, email, password);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!registerFormCanSubmit(firstName, lastName, email, password)) {
      setFirstBlurred(true);
      setLastBlurred(true);
      setEmailBlurred(true);
      setPasswordBlurred(true);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await register({
        email: email.trim(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      });
      navigate("/", { replace: true });
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
        const d = err.response.data as Record<string, unknown>;
        if (typeof d.email === "object" && Array.isArray(d.email)) {
          setError(d.email.join(" "));
        } else if (typeof d.password === "object" && Array.isArray(d.password)) {
          setError(d.password.join(" "));
        } else if (typeof d.detail === "string") {
          setError(d.detail);
        } else {
          setError("Could not create account. Try a different email.");
        }
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
              Create account
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="reg-first"
                className="block text-sm font-semibold text-on-surface mb-1"
              >
                First name
                <span className="text-error ml-1" aria-hidden>
                  *
                </span>
              </label>
              <input
                id="reg-first"
                type="text"
                autoComplete="given-name"
                aria-invalid={Boolean(firstError)}
                aria-required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={() => setFirstBlurred(true)}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              />
              {firstError ? (
                <p className="mt-1 text-xs text-error font-body" role="alert">
                  {firstError}
                </p>
              ) : null}
            </div>
            <div>
              <label
                htmlFor="reg-last"
                className="block text-sm font-semibold text-on-surface mb-1"
              >
                Last name
                <span className="text-error ml-1" aria-hidden>
                  *
                </span>
              </label>
              <input
                id="reg-last"
                type="text"
                autoComplete="family-name"
                aria-invalid={Boolean(lastError)}
                aria-required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={() => setLastBlurred(true)}
                className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              />
              {lastError ? (
                <p className="mt-1 text-xs text-error font-body" role="alert">
                  {lastError}
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <label
              htmlFor="reg-email"
              className="block text-sm font-semibold text-on-surface mb-1"
            >
              Email
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            </label>
            <input
              id="reg-email"
              type="text"
              inputMode="email"
              autoComplete="email"
              aria-invalid={Boolean(emailError)}
              aria-required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => setEmailBlurred(true)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
            />
            {emailError ? (
              <p className="mt-1 text-xs text-error font-body" role="alert">
                {emailError}
              </p>
            ) : null}
          </div>
          <div>
            <label
              htmlFor="reg-password"
              className="block text-sm font-semibold text-on-surface mb-1"
            >
              Password
              <span className="text-error ml-1" aria-hidden>
                *
              </span>
            </label>
            <input
              id="reg-password"
              type="password"
              autoComplete="new-password"
              aria-invalid={Boolean(passwordError)}
              aria-required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setPasswordBlurred(true)}
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-2.5 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              At least 8 characters
            </p>
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
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-on-surface-variant">
          Already have an account?{" "}
          <Link
            to="/login"
            className="font-semibold text-primary hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
