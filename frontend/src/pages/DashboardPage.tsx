import React from "react";
import { Link } from "react-router-dom";
import { useDeleteSymptomSession, useSymptomSessions } from "../api/queries";

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

function triageBadgeClasses(level: string | null): string {
  if (level === "emergency") {
    return "bg-error-container/50 text-on-error-container border-error-container/40";
  }
  if (level === "urgent") {
    return "bg-tertiary-container/50 text-on-tertiary-container border-tertiary-container/40";
  }
  if (level === "routine") {
    return "bg-primary-fixed/15 text-primary border-primary-fixed-dim/40";
  }
  return "bg-surface-container-high text-on-surface-variant border-outline-variant/30";
}

function triageLabel(level: string | null): string {
  if (!level) return "Triage pending";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

const DashboardPage: React.FC = () => {
  const { data: sessions, isLoading, isError, error } = useSymptomSessions();
  const deleteSession = useDeleteSymptomSession();
  return (
    <div className="p-6 md:p-10 lg:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-headline text-4xl md:text-[3.5rem] leading-none font-bold text-primary tracking-tight mb-2">
              Health Hub
            </h1>
            <p className="font-body text-on-surface-variant text-base">
              Your clinical sanctuary for holistic well-being.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-surface-container-lowest px-4 py-2 rounded-full shadow-ambient border-ghost">
            <div className="w-2 h-2 rounded-full bg-secondary"></div>
            <span className="font-body text-sm font-medium text-on-surface">
              All systems optimal
            </span>
          </div>
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {/* Care Pathway Hero Card */}
          <div className="col-span-1 md:col-span-12 lg:col-span-8 bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-ambient">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-on-primary text-xs font-semibold uppercase tracking-wider mb-6">
                <span className="material-symbols-outlined text-[16px]">
                  directions
                </span>
                Active Care Pathway
              </div>
              <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-primary max-w-lg leading-tight mb-4">
                Complete your pre-assessment for Dr. Hayes.
              </h2>
              <p className="font-body text-primary-fixed-dim text-base max-w-md mb-8">
                Your upcoming Care Match requires a brief symptom log update to
                ensure a precise consultation.
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-4 mt-auto">
              <button className="bg-surface-container-lowest text-primary font-headline font-bold py-3 px-6 rounded shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                Start Assessment
                <span className="material-symbols-outlined text-lg">
                  arrow_forward
                </span>
              </button>
              <button className="text-on-primary font-body font-medium hover:underline px-2">
                Reschedule
              </button>
            </div>
          </div>

          {/* Health Snapshot */}
          <div className="col-span-1 md:col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-ambient border-ghost flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="font-headline text-xl font-bold text-primary">
                Health Snapshot
              </h3>
              <button className="text-outline hover:text-primary transition-colors">
                <span className="material-symbols-outlined">more_horiz</span>
              </button>
            </div>

            {/* Progress Ring */}
            <div className="flex items-center justify-center py-4">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg
                  className="w-full h-full transform -rotate-90 absolute"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#f1f4f9"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#00696d"
                    strokeWidth="8"
                    strokeDasharray="283"
                    strokeDashoffset="56"
                    className="drop-shadow-sm"
                  />
                </svg>
                <div className="text-center flex flex-col items-center">
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    82<span className="text-lg text-outline">%</span>
                  </span>
                  <span className="font-body text-xs text-on-surface-variant font-medium uppercase tracking-widest mt-1">
                    Vitality
                  </span>
                </div>
              </div>
            </div>

            {/* Mini Stats */}
            <div className="flex flex-col gap-4 mt-auto">
              <div className="flex items-start gap-4 p-3 bg-surface-container-low rounded-lg">
                <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    monitor_heart
                  </span>
                </div>
                <div>
                  <p className="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Last Vitals
                  </p>
                  <p className="font-headline text-sm font-bold text-on-surface">
                    BP: 120/80
                    <span className="text-outline font-normal mx-1">|</span>
                    HR: 72 bpm
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 bg-surface-container-low rounded-lg">
                <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    prescriptions
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Active Meds
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="font-headline text-sm font-bold text-on-surface">
                      Lisinopril 10mg
                    </p>
                    <span className="bg-surface-container-lowest text-secondary text-[10px] font-bold px-2 py-0.5 rounded-full border-ghost">
                      On Track
                    </span>
                  </div>
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
                    <li key={s.session_id} className="group">
                      <div className="flex items-stretch rounded-xl shadow-ambient border-ghost bg-surface-container-lowest hover:bg-surface-bright transition-colors duration-200 overflow-hidden focus-within:ring-2 focus-within:ring-primary focus-within:ring-offset-2 focus-within:ring-offset-surface-container-lowest">
                        <Link
                          aria-label={`Open symptom session from ${formatSessionTimestamp(s.created_at)}`}
                          className="flex flex-1 min-w-0 flex-col sm:flex-row sm:items-start sm:justify-between gap-4 p-5 md:p-6 outline-none"
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
                        <div className="flex items-center shrink-0 border-l border-outline-variant/20 bg-surface-container-lowest group-hover:bg-surface-bright pl-1 pr-2 md:pr-3">
                          <button
                            type="button"
                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-error/40 bg-error/10 text-error hover:bg-error/20 disabled:cursor-not-allowed disabled:opacity-50 opacity-100 md:opacity-0 md:pointer-events-none md:group-hover:opacity-100 md:group-hover:pointer-events-auto md:group-focus-within:opacity-100 md:group-focus-within:pointer-events-auto focus-visible:opacity-100 focus-visible:pointer-events-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
                            aria-label="Delete this symptom check"
                            disabled={deletingThis}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              if (
                                !window.confirm(
                                  "Delete this symptom check? You will not be able to recover it.",
                                )
                              ) {
                                return;
                              }
                              deleteSession.mutate(s.session_id);
                            }}
                          >
                            <span className="material-symbols-outlined text-[22px]" aria-hidden>
                              delete
                            </span>
                          </button>
                        </div>
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
