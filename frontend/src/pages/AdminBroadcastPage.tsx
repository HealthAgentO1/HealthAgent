import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { getBroadcastEligibility } from "../api/broadcastEligibility";
import { postBroadcastEmail } from "../api/adminBroadcast";
import { useAuth } from "../context/AuthContext";

const DEFAULT_SUBJECT = "Update from HealthOS";
const DEFAULT_MESSAGE = `Hello,

This is a brief message from the HealthOS team. Thank you for using the app.

— HealthOS
`;

/**
 * Shown after login when the API reports broadcast eligibility (see ``BROADCAST_ADMIN_EMAIL`` on Django).
 */
const AdminBroadcastPage = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [subject, setSubject] = useState(DEFAULT_SUBJECT);
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gate, setGate] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { eligible, configured } = await getBroadcastEligibility();
        if (cancelled) return;
        if (!configured) {
          setGate("denied");
          navigate("/", { replace: true });
          return;
        }
        setGate(eligible ? "allowed" : "denied");
        if (!eligible) {
          navigate("/", { replace: true });
        }
      } catch {
        if (!cancelled) {
          setGate("denied");
          navigate("/", { replace: true });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleSkip = () => {
    navigate("/", { replace: true });
  };

  const handleSend = async () => {
    setError(null);
    setBusy(true);
    try {
      await postBroadcastEmail({ subject: subject.trim() || DEFAULT_SUBJECT, message: message.trim() });
      navigate("/", { replace: true });
    } catch (e) {
      if (isAxiosError(e) && e.response?.data) {
        const d = e.response.data as Record<string, unknown>;
        setError(typeof d.detail === "string" ? d.detail : "Request failed.");
      } else {
        setError("Network error. Is the API running?");
      }
    } finally {
      setBusy(false);
    }
  };

  if (gate === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center bg-surface px-4 font-body text-on-surface-variant">
        Loading…
      </div>
    );
  }

  if (gate !== "allowed") {
    return null;
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-10 md:py-14">
      <div className="rounded-2xl border border-outline-variant/40 bg-surface-container-lowest p-6 shadow-ambient md:p-8">
        <h1 className="font-headline text-xl font-bold text-primary md:text-2xl">Send site announcement</h1>
        <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">
          You are signed in as the configured broadcast account. You can send one email (same subject and
          message) to every registered user, then continue into the app. Delivery uses your Django email
          settings (local dev often prints to the server console).
        </p>
        <p className="mt-2 text-xs text-on-surface-variant">
          Mass email may be regulated where your users live; only send content users would reasonably expect.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="bc-subject" className="mb-1 block text-sm font-semibold text-on-surface">
              Subject
            </label>
            <input
              id="bc-subject"
              className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="bc-body" className="mb-1 block text-sm font-semibold text-on-surface">
              Message
            </label>
            <textarea
              id="bc-body"
              rows={8}
              className="w-full resize-y rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </div>
        </div>

        {error ? (
          <div
            className="mt-4 rounded-lg border border-error/30 bg-error-container/30 px-3 py-2 text-sm text-on-error-container"
            role="alert"
          >
            {error}
          </div>
        ) : null}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <button
            type="button"
            disabled={busy || !message.trim()}
            className="gradient-primary cursor-pointer rounded-lg px-6 py-3 font-headline text-sm font-semibold text-on-primary shadow-ambient transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => void handleSend()}
          >
            {busy ? "Sending…" : "Send email to all users"}
          </button>
          <button
            type="button"
            disabled={busy}
            className="cursor-pointer rounded-lg border border-outline-variant/50 px-6 py-3 font-headline text-sm font-semibold text-primary hover:bg-surface-container-high/80 disabled:opacity-50"
            onClick={handleSkip}
          >
            Skip and go to app
          </button>
          <button
            type="button"
            disabled={busy}
            className="cursor-pointer text-left text-sm font-semibold text-on-surface-variant underline decoration-outline-variant hover:text-primary sm:ml-auto"
            onClick={() => {
              logout();
              navigate("/login", { replace: true });
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default AdminBroadcastPage;
