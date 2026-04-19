import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { triageBadgeClasses } from "../utils/triageSeverityStyles";
import {
  useDeleteSymptomSession,
  useSymptomSessions,
  type SymptomSessionListItem,
} from "../api/queries";
import { loadActiveRegimen } from "../medicationSafety/medicationRegimenStorage";
import { MedicationNameHeading } from "../medicationSafety/MedicationNameHeading";

function formatSessionTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(d);
  } catch {
    return iso;
  }
}

function triageLabel(level: string | null): string {
  if (!level) return "Triage pending";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function pickLatestSession(list: SymptomSessionListItem[]): SymptomSessionListItem | null {
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )[0];
}

const DashboardPage: React.FC = () => {
  const { data: sessions, isLoading, isError, error } = useSymptomSessions();
  const deleteSession = useDeleteSymptomSession();
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  const [regimen, setRegimen] = useState(() => loadActiveRegimen());

  useEffect(() => {
    const refresh = () => setRegimen(loadActiveRegimen());
    refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  const latestSession = useMemo(
    () => (!sessions?.length ? null : pickLatestSession(sessions)),
    [sessions],
  );

  const confirmDeleteSession =
    confirmDeleteSessionId && sessions
      ? sessions.find((s) => s.session_id === confirmDeleteSessionId)
      : undefined;

  return (
    <div className="p-6 md:p-10 lg:p-12">
      {confirmDeleteSessionId ? (
        <div
          aria-labelledby="delete-session-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
        >
          <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-md w-full p-6 md:p-8 border border-outline-variant/20">
            <h2
              className="text-xl font-headline font-bold text-primary mb-2"
              id="delete-session-title"
            >
              Delete symptom check?
            </h2>
            <p className="text-sm text-on-surface-variant font-body mb-6">
              {confirmDeleteSession ? (
                <>
                  The check from{" "}
                  <span className="font-medium text-on-surface">
                    {formatSessionTimestamp(confirmDeleteSession.created_at)}
                  </span>{" "}
                  will be removed from your history. You will not be able to recover it.
                </>
              ) : (
                <>This symptom check will be removed. You will not be able to recover it.</>
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className="cursor-pointer bg-error text-on-error px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:bg-[#93000a] transition-colors sm:flex-1"
                onClick={() => {
                  const id = confirmDeleteSessionId;
                  setConfirmDeleteSessionId(null);
                  if (id) deleteSession.mutate(id);
                }}
                type="button"
              >
                Delete
              </button>
              <button
                className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                onClick={() => setConfirmDeleteSessionId(null)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <header>
          <div>
            <h1 className="font-headline text-4xl md:text-[3.5rem] leading-none font-bold text-primary tracking-tight mb-2">
              HealthOS
            </h1>
            <p className="font-body text-on-surface-variant text-base">
              Your clinical sanctuary for holistic well-being.
            </p>
          </div>
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {/* Care Pathway Hero Card */}
          <div className="col-span-1 md:col-span-12 lg:col-span-8 bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-ambient">
              <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4" />
              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-on-primary text-xs font-semibold uppercase tracking-wider mb-6">
                  <span className="material-symbols-outlined text-[16px]">directions</span>
                  Active Care Pathway
                </div>
                {isLoading ? (
                  <>
                    <h3 className="font-headline text-3xl md:text-4xl font-bold text-on-primary max-w-lg leading-tight mb-4">
                      Loading your care timeline…
                    </h3>
                    <p className="font-body text-primary-fixed-dim text-base max-w-md mb-8">
                      One moment while we load your saved symptom checks.
                    </p>
                  </>
                ) : isError ? (
                  <>
                    <h3 className="font-headline text-3xl md:text-4xl font-bold text-on-primary max-w-lg leading-tight mb-4">
                      Symptom history is unavailable
                    </h3>
                    <p className="font-body text-primary-fixed-dim text-base max-w-md mb-8">
                      {error instanceof Error ? error.message : "You can still run a new check."}
                    </p>
                  </>
                ) : latestSession ? (
                  <>
                    <h3 className="font-headline text-3xl md:text-4xl font-bold text-on-primary max-w-lg leading-tight mb-4">
                      Review or update your latest symptom check
                    </h3>
                    <p className="font-body text-primary-fixed-dim text-base max-w-md mb-8">
                      Last documented {formatSessionTimestamp(latestSession.created_at)}. Open it
                      to see details, or start fresh if something has changed.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-headline text-3xl md:text-4xl font-bold text-on-primary max-w-lg leading-tight mb-4">
                      Start your first symptom check
                    </h3>
                    <p className="font-body text-primary-fixed-dim text-base max-w-md mb-8">
                      A short guided interview creates a record you can revisit and share with your
                      care team.
                    </p>
                  </>
                )}
              </div>
              <div className="relative z-10 flex flex-wrap items-center gap-3 md:gap-4 mt-auto">
                {isLoading ? (
                  <button
                    className="bg-surface-container-lowest/70 text-primary/70 font-headline font-bold py-3 px-6 rounded shadow-sm cursor-wait flex items-center gap-2"
                    disabled
                    type="button"
                  >
                    Loading…
                  </button>
                ) : isError ? (
                  <Link
                    className="bg-surface-container-lowest text-primary font-headline font-bold py-3 px-6 rounded shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                    to="/symptom-check"
                  >
                    New symptom check
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </Link>
                ) : latestSession ? (
                  <>
                    <Link
                      className="bg-surface-container-lowest text-primary font-headline font-bold py-3 px-6 rounded shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                      to={`/symptom-check?session=${encodeURIComponent(latestSession.session_id)}`}
                    >
                      Open latest check
                      <span className="material-symbols-outlined text-lg">arrow_forward</span>
                    </Link>
                    <Link
                      className="text-on-primary font-body font-medium hover:underline px-2 py-2"
                      to="/symptom-check"
                    >
                      New symptom check
                    </Link>
                  </>
                ) : (
                  <Link
                    className="bg-surface-container-lowest text-primary font-headline font-bold py-3 px-6 rounded shadow-sm hover:shadow-md transition-all flex items-center gap-2"
                    to="/symptom-check"
                  >
                    Start symptom check
                    <span className="material-symbols-outlined text-lg">arrow_forward</span>
                  </Link>
                )}
                <Link
                  className="text-on-primary font-body font-medium hover:underline px-2 py-2"
                  to="/medication-safety"
                >
                  Medications
                </Link>
              </div>
            </div>

          {/* Health Snapshot */}
          <div className="col-span-1 md:col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-ambient border-ghost flex flex-col gap-6">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-headline text-xl font-bold text-primary">Health Snapshot</h3>
                <Link
                  aria-label="Open reports"
                  className="text-outline hover:text-primary transition-colors p-1 rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                  to="/reports"
                >
                  <span className="material-symbols-outlined">lab_profile</span>
                </Link>
              </div>

              <div className="flex flex-col gap-4 mt-auto">
                <div className="flex items-start gap-4 p-3 bg-surface-container-low rounded-lg min-w-0">
                  <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">stethoscope</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Last symptom check
                    </p>
                    {isLoading ? (
                      <p className="font-body text-sm text-on-surface-variant">Loading…</p>
                    ) : isError ? (
                      <p className="font-body text-sm text-on-surface-variant">Unavailable</p>
                    ) : latestSession ? (
                      <>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${triageBadgeClasses(latestSession.triage_level)}`}
                          >
                            {triageLabel(latestSession.triage_level)}
                          </span>
                          <span className="font-body text-xs text-on-surface-variant">
                            {formatSessionTimestamp(latestSession.created_at)}
                          </span>
                        </div>
                        <p className="font-body text-sm text-on-surface line-clamp-2">
                          {latestSession.summary.trim()
                            ? latestSession.summary
                            : "No summary for this session yet."}
                        </p>
                        <Link
                          className="inline-flex items-center gap-0.5 font-body text-xs font-semibold text-primary mt-2 hover:underline"
                          to={`/symptom-check?session=${encodeURIComponent(latestSession.session_id)}`}
                        >
                          Open session
                          <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </Link>
                      </>
                    ) : (
                      <>
                        <p className="font-body text-sm text-on-surface-variant mb-2">
                          No checks yet.
                        </p>
                        <Link
                          className="inline-flex items-center gap-0.5 font-body text-xs font-semibold text-primary hover:underline"
                          to="/symptom-check"
                        >
                          Start one
                          <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </Link>
                      </>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-4 p-3 bg-surface-container-low rounded-lg min-w-0">
                  <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-[18px]">prescriptions</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                      Active medications
                    </p>
                    {regimen.length ? (
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <MedicationNameHeading med={regimen[0]} size="list" />
                          {regimen.length > 1 ? (
                            <p className="font-body text-xs text-on-surface-variant mt-1">
                              +{regimen.length - 1} more on file
                            </p>
                          ) : null}
                        </div>
                        <span className="bg-surface-container-lowest text-secondary text-[10px] font-bold px-2 py-0.5 rounded-full border-ghost shrink-0">
                          On file
                        </span>
                      </div>
                    ) : (
                      <>
                        <p className="font-body text-sm text-on-surface-variant mb-2">
                          None listed in this browser yet.
                        </p>
                        <Link
                          className="inline-flex items-center gap-0.5 font-body text-xs font-semibold text-primary hover:underline"
                          to="/medication-safety"
                        >
                          Add medications
                          <span className="material-symbols-outlined text-sm">chevron_right</span>
                        </Link>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

          {/* Past symptom triage sessions */}
          <div className="col-span-1 md:col-span-12">
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
              <div>
                <h3 className="font-headline text-2xl font-bold text-primary">
                  Past symptom checks
                </h3>
                <p className="font-body text-sm text-on-surface-variant mt-1">
                  Triage sessions saved to your account.
                </p>
              </div>
              <Link
                className="font-body text-sm font-semibold text-primary hover:text-primary-container transition-colors inline-flex items-center shrink-0"
                to="/symptom-check"
              >
                New symptom check
                <span className="material-symbols-outlined text-sm ml-1">arrow_forward</span>
              </Link>
            </div>

            {isLoading ? (
              <div className="rounded-xl border border-ghost bg-surface-container-lowest p-10 text-center font-body text-on-surface-variant">
                Loading your sessions…
              </div>
            ) : isError ? (
              <div
                className="rounded-xl border border-error-container/40 bg-error-container/10 p-6 font-body text-sm text-on-error-container"
                role="alert"
              >
                {error instanceof Error
                  ? error.message
                  : "Could not load symptom history. Try again later."}
              </div>
            ) : !sessions?.length ? (
              <div className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-lowest/80 p-10 md:p-14 text-center">
                <div className="w-14 h-14 rounded-full bg-primary-fixed/15 text-primary mx-auto flex items-center justify-center mb-5">
                  <span className="material-symbols-outlined text-[28px]">stethoscope</span>
                </div>
                <h4 className="font-headline text-lg font-bold text-on-surface mb-2">
                  No symptom checks yet
                </h4>
                <p className="font-body text-sm text-on-surface-variant max-w-md mx-auto mb-6">
                  When you complete a triage interview, it will appear here with the urgency
                  level and a short summary.
                </p>
                <Link
                  className="inline-flex items-center gap-2 bg-primary text-on-primary font-headline text-sm font-bold py-3 px-6 rounded-lg shadow-ambient hover:opacity-95 transition-opacity"
                  to="/symptom-check"
                >
                  Start a symptom check
                  <span className="material-symbols-outlined text-lg">arrow_forward</span>
                </Link>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {deleteSession.isError ? (
                  <div
                    className="rounded-xl border border-error-container/40 bg-error-container/10 px-4 py-3 font-body text-sm text-on-error-container"
                    role="alert"
                  >
                    {deleteSession.error instanceof Error
                      ? deleteSession.error.message
                      : "Could not delete that session. Try again."}
                  </div>
                ) : null}
                <ul className="flex flex-col gap-4">
                {sessions.map((s) => {
                  const deletingThis =
                    deleteSession.isPending && deleteSession.variables === s.session_id;
                  return (
                    <li key={s.session_id}>
                      <div className="group relative rounded-xl shadow-ambient border-ghost bg-surface-container-lowest hover:bg-surface-bright transition-colors duration-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-surface-container-lowest">
                        <Link
                          aria-label={`Open symptom session from ${formatSessionTimestamp(s.created_at)}`}
                          className="flex min-w-0 flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-5 pr-14 md:p-6 md:pr-16 outline-none"
                          to={`/symptom-check?session=${encodeURIComponent(s.session_id)}`}
                        >
                          <div className="flex items-start gap-4 min-w-0 flex-1">
                            <div className="w-12 h-12 rounded-full bg-secondary-container/40 text-on-secondary-container flex items-center justify-center shrink-0">
                              <span className="material-symbols-outlined icon-fill">chat</span>
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2 mb-2">
                                <span
                                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${triageBadgeClasses(s.triage_level)}`}
                                >
                                  {triageLabel(s.triage_level)}
                                </span>
                                <span className="font-body text-xs text-on-surface-variant">
                                  {formatSessionTimestamp(s.created_at)}
                                </span>
                                <span className="font-body text-xs font-semibold text-primary">
                                  Open
                                  <span className="material-symbols-outlined text-sm align-middle ml-0.5">
                                    chevron_right
                                  </span>
                                </span>
                              </div>
                              <p className="font-body text-sm text-on-surface line-clamp-3">
                                {s.summary.trim()
                                  ? s.summary
                                  : "No summary recorded for this session yet."}
                              </p>
                            </div>
                          </div>
                        </Link>
                        <button
                          type="button"
                          className="absolute inset-y-2 right-2 z-10 flex cursor-pointer items-center justify-center rounded-md text-error outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50"
                          aria-label="Delete this symptom check"
                          disabled={deletingThis}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setConfirmDeleteSessionId(s.session_id);
                          }}
                        >
                          <span
                            className={`inline-flex items-center justify-center rounded-lg border border-error/35 bg-error/10 p-1.5 shadow-sm transition-opacity duration-150 ${
                              deletingThis
                                ? "opacity-100"
                                : "opacity-0 max-md:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100"
                            }`}
                          >
                            <span className="material-symbols-outlined text-[22px]" aria-hidden>
                              delete
                            </span>
                          </span>
                        </button>
                      </div>
                    </li>
                  );
                })}
                </ul>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
