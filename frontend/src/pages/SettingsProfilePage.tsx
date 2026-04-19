import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { isAxiosError } from "axios";
import { fetchUserProfile, updateUserProfile } from "../api/profile";
import { useAuth } from "../context/AuthContext";

function displayInitial(first: string, last: string, email: string | null): string {
  const f = first.trim();
  const l = last.trim();
  if (f) return f.charAt(0).toUpperCase();
  if (l) return l.charAt(0).toUpperCase();
  return email?.trim().charAt(0).toUpperCase() || "?";
}

const SettingsProfilePage: React.FC = () => {
  const { email, logout } = useAuth();
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [birthdate, setBirthdate] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedHint, setSavedHint] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const p = await fetchUserProfile();
      setFirstName(p.first_name ?? "");
      setLastName(p.last_name ?? "");
      setBirthdate(p.date_of_birth ?? "");
    } catch (e) {
      if (isAxiosError(e) && e.response?.status === 401) {
        setLoadError("Session expired. Sign in again.");
      } else {
        setLoadError("Could not load your profile. Try refreshing the page.");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const initial = useMemo(
    () => displayInitial(firstName, lastName, email),
    [firstName, lastName, email],
  );

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleSaveDetails = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);
    setSavedHint(false);
    setSaving(true);
    try {
      const dob = birthdate.trim();
      await updateUserProfile({
        first_name: firstName.trim(),
        last_name: lastName.trim(),
        date_of_birth: dob.length > 0 ? dob : null,
      });
      setSavedHint(true);
      window.setTimeout(() => setSavedHint(false), 4000);
    } catch (err) {
      if (isAxiosError(err) && err.response?.data) {
        const d = err.response.data as Record<string, unknown>;
        if (typeof d.detail === "string") {
          setSaveError(d.detail);
        } else if (typeof d.date_of_birth === "object" && Array.isArray(d.date_of_birth)) {
          setSaveError(d.date_of_birth.join(" "));
        } else {
          setSaveError("Could not save. Check your input and try again.");
        }
      } else {
        setSaveError("Network error. Is the API running?");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12 pb-16">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary-fixed-dim/30 bg-secondary-fixed px-3 py-1 text-xs font-semibold uppercase tracking-wide text-on-secondary-fixed">
            <span className="material-symbols-outlined text-sm">manage_accounts</span>
            Account
          </div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary md:text-5xl">
            Settings &amp; profile
          </h1>
          <p className="max-w-2xl font-body text-base text-on-surface-variant">
            Review how you are signed in and how HealthOS uses your information in this browser.
          </p>
        </header>

        <section
          className="rounded-xl border border-ghost bg-surface-container-lowest p-5 shadow-ambient md:p-6"
          aria-labelledby="profile-heading"
        >
          <h2
            className="mb-4 flex items-center gap-2 font-headline text-lg font-bold text-primary md:text-xl"
            id="profile-heading"
          >
            <span className="material-symbols-outlined text-secondary text-[22px]">person</span>
            Profile
          </h2>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div
              className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-primary-fixed/35 font-headline text-2xl font-extrabold text-primary"
              aria-hidden
            >
              {initial}
            </div>
            <div className="min-w-0 flex-1 space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                  Signed in as
                </p>
                <p className="mt-0.5 break-all font-body text-base font-medium text-on-surface">{email ?? "—"}</p>
              </div>
              <p className="text-sm leading-snug text-on-surface-variant">
                Add your name and birth date so the app can greet you accurately; stored with your account.
              </p>

              {loadError ? (
                <p className="text-sm text-error font-body" role="alert">
                  {loadError}
                </p>
              ) : null}

              {!loading && !loadError ? (
                <form
                  id="profile-about-form"
                  className="space-y-3 border-t border-outline-variant/15 pt-3"
                  onSubmit={handleSaveDetails}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
                    About you
                  </p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label htmlFor="profile-first" className="mb-0.5 block text-sm font-semibold text-on-surface">
                        First name
                      </label>
                      <input
                        id="profile-first"
                        autoComplete="given-name"
                        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        maxLength={150}
                      />
                    </div>
                    <div>
                      <label htmlFor="profile-last" className="mb-0.5 block text-sm font-semibold text-on-surface">
                        Last name
                      </label>
                      <input
                        id="profile-last"
                        autoComplete="family-name"
                        className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        maxLength={150}
                      />
                    </div>
                  </div>
                  <div className="max-w-xs">
                    <label htmlFor="profile-dob" className="mb-0.5 block text-sm font-semibold text-on-surface">
                      Date of birth
                    </label>
                    <input
                      id="profile-dob"
                      className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
                      type="date"
                      value={birthdate}
                      onChange={(e) => setBirthdate(e.target.value)}
                    />
                    <p className="mt-0.5 text-[11px] leading-tight text-on-surface-variant">Optional.</p>
                  </div>

                  {saveError ? (
                    <p className="text-sm text-error font-body" role="alert">
                      {saveError}
                    </p>
                  ) : null}
                  {savedHint ? (
                    <p className="text-sm font-medium text-secondary font-body" role="status">
                      Saved.
                    </p>
                  ) : null}
                </form>
              ) : loading ? (
                <p className="border-t border-outline-variant/15 pt-3 text-sm text-on-surface-variant font-body">
                  Loading profile…
                </p>
              ) : null}

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {!loading && !loadError ? (
                  <button
                    form="profile-about-form"
                    type="submit"
                    disabled={saving}
                    className="gradient-primary cursor-pointer rounded-lg px-5 py-2 font-headline text-sm font-semibold text-on-primary shadow-ambient transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save details"}
                  </button>
                ) : null}
                <button
                  type="button"
                  className="cursor-pointer rounded-lg border border-outline-variant/50 px-5 py-2 font-headline text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high/80"
                  onClick={handleSignOut}
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </section>

        <section
          className="rounded-xl border border-ghost bg-surface-container-lowest p-6 shadow-ambient md:p-8"
          aria-labelledby="settings-heading"
        >
          <h2
            className="mb-4 flex items-center gap-2 font-headline text-xl font-bold text-primary"
            id="settings-heading"
          >
            <span className="material-symbols-outlined text-secondary">tune</span>
            App &amp; data
          </h2>
          <ul className="list-disc space-y-3 pl-5 font-body text-sm leading-relaxed text-on-surface-variant">
            <li>
              <strong className="text-on-surface">Symptom Check</strong> can save progress in this
              browser so you can resume. Clear site data in your browser if you need to remove it.
            </li>
            <li>
              <strong className="text-on-surface">Medication Safety</strong> stores your regimen list
              locally on this device; it is not synced to our servers in this build.
            </li>
            <li>
              <strong className="text-on-surface">Reports</strong> lists symptom sessions tied to your
              account when you complete flows that save to the server.
            </li>
          </ul>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-primary/35 bg-primary-fixed/15 px-5 py-2.5 font-headline text-sm font-semibold text-primary transition-colors hover:bg-primary-fixed/25"
              to="/symptom-check"
            >
              Symptom Check
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </Link>
            <Link
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-outline-variant/40 px-5 py-2.5 font-headline text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high/80"
              to="/reports"
            >
              Reports
              <span className="material-symbols-outlined text-lg">description</span>
            </Link>
          </div>
        </section>

        <section
          className="rounded-xl border border-outline-variant/20 bg-surface-container-low/80 p-5 md:p-6"
          aria-labelledby="about-heading"
        >
          <h2 className="mb-2 font-headline text-sm font-bold text-on-surface" id="about-heading">
            About HealthOS
          </h2>
          <p className="font-body text-sm leading-relaxed text-on-surface-variant">
            HealthOS is a clinical workspace preview. It does not replace emergency services or your
            clinician’s judgment. For urgent concerns, use{" "}
            <Link className="font-semibold text-primary underline-offset-2 hover:underline" to="/emergency">
              Emergency contacts
            </Link>
            .
          </p>
        </section>
      </div>
    </div>
  );
};

export default SettingsProfilePage;
