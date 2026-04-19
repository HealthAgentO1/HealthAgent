import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import {
  useDeleteSymptomSession,
  useSymptomSessions,
  type SymptomSessionListItem,
} from "../api/queries";
import {
  buildPatientFriendlyPreVisit,
  type PatientFriendlyPreVisit,
} from "../utils/preVisitReportPatientView";
import { patientCheckListLabel } from "../utils/sessionShortTitle";
import { triageBadgeClasses, triageNoteBubbleClasses } from "../utils/triageSeverityStyles";
import { scrollAppToTop } from "../utils/scrollAppToTop";
import { parsePostVisitDiagnosis } from "../symptomCheck/postVisitDiagnosisTypes";

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
  if (!level) return "Triage not set";
  return level.charAt(0).toUpperCase() + level.slice(1);
}

function ReportSectionsView({ view }: { view: PatientFriendlyPreVisit }) {
  return (
    <div className="space-y-5 mt-4">
      {view.triagePatientNote ? (
        <div
          className={`rounded-lg border px-4 py-3 ${triageNoteBubbleClasses(view.triageLevel)}`}
        >
          <p className="font-body text-sm leading-relaxed">{view.triagePatientNote}</p>
        </div>
      ) : null}
      {view.sections.map((sec) => (
        <section key={sec.heading} className="border-t border-outline-variant/20 pt-4 first:border-t-0 first:pt-0">
          <h4 className="font-headline text-sm font-bold text-primary mb-2">{sec.heading}</h4>
          {sec.body ? (
            <p className="font-body text-sm text-on-surface leading-relaxed whitespace-pre-wrap">{sec.body}</p>
          ) : null}
          {sec.bullets?.length ? (
            <ul className="list-disc pl-5 mt-2 space-y-1.5 font-body text-sm text-on-surface leading-relaxed">
              {sec.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  );
}

type ReportsLocationState = { scrollToTop?: boolean };

const ReportsPage: React.FC = () => {
  const location = useLocation();
  const { data: sessions, isLoading, isError, error, refetch, isFetching } = useSymptomSessions();
  const deleteSession = useDeleteSymptomSession();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("session");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<string | null>(null);
  /** Tracks a single refetch attempt when `?session=` is not yet in the cached list (e.g. right after a new check). */
  const pendingSessionRefetchRef = useRef<string | null>(null);

  const ordered = useMemo(() => [...(sessions ?? [])], [sessions]);

  useLayoutEffect(() => {
    const st = (location.state as ReportsLocationState | null)?.scrollToTop;
    if (st) {
      scrollAppToTop();
    }
  }, [location.state, location.key]);

  useEffect(() => {
    if (isLoading) return;
    if (!ordered.length) {
      setSearchParams({}, { replace: true });
      return;
    }

    const hasSelected = Boolean(selectedId && ordered.some((s) => s.session_id === selectedId));
    if (hasSelected) {
      pendingSessionRefetchRef.current = null;
      return;
    }

    if (selectedId) {
      if (pendingSessionRefetchRef.current !== selectedId) {
        pendingSessionRefetchRef.current = selectedId;
        void refetch();
        return;
      }
      pendingSessionRefetchRef.current = null;
      setSearchParams({ session: ordered[0].session_id }, { replace: true });
      return;
    }

    setSearchParams({ session: ordered[0].session_id }, { replace: true });
  }, [ordered, selectedId, isLoading, setSearchParams, refetch]);

  const confirmDeleteSession =
    confirmDeleteSessionId && sessions
      ? sessions.find((s) => s.session_id === confirmDeleteSessionId)
      : undefined;

  const selected = ordered.find((s) => s.session_id === selectedId) ?? null;
  const patientView = selected
    ? buildPatientFriendlyPreVisit(selected.pre_visit_report ?? undefined)
    : null;
  const postVisitDx = selected
    ? parsePostVisitDiagnosis(selected.post_visit_diagnosis ?? null)
    : null;

  const selectSession = useCallback(
    (id: string) => {
      setSearchParams({ session: id });
    },
    [setSearchParams],
  );

  const handleDownloadPdf = useCallback(async () => {
    if (!selected) return;
    setPdfBusy(true);
    try {
      const { downloadPreVisitReportPdf } = await import("../utils/preVisitReportPdf");
      await downloadPreVisitReportPdf({
        createdAtIso: selected.created_at,
        sessionId: selected.session_id,
        triageLevel: selected.triage_level,
        summaryLine: selected.summary,
        patientView,
      });
    } finally {
      setPdfBusy(false);
    }
  }, [patientView, selected]);

  return (
    <div className="p-6 md:p-10 lg:p-12">
      {confirmDeleteSessionId ? (
        <div
          aria-labelledby="delete-report-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
        >
          <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-md w-full p-6 md:p-8 border border-outline-variant/20">
            <h2
              className="text-xl font-headline font-bold text-primary mb-2"
              id="delete-report-title"
            >
              Delete this report?
            </h2>
            <p className="text-sm text-on-surface-variant font-body mb-6">
              {confirmDeleteSession ? (
                <>
                  The report from{" "}
                  <span className="font-medium text-on-surface">
                    {formatSessionTimestamp(confirmDeleteSession.created_at)}
                  </span>{" "}
                  will be removed from your history. You will not be able to recover it.
                </>
              ) : (
                <>This report will be removed. You will not be able to recover it.</>
              )}
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className="cursor-pointer bg-error text-on-error px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:bg-[#93000a] transition-colors sm:flex-1"
                onClick={() => {
                  const id = confirmDeleteSessionId;
                  setConfirmDeleteSessionId(null);
                  if (id) {
                    deleteSession.reset();
                    deleteSession.mutate(id);
                  }
                }}
                type="button"
              >
                Delete
              </button>
              <button
                className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                onClick={() => {
                  deleteSession.reset();
                  setConfirmDeleteSessionId(null);
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto max-w-6xl min-w-0 space-y-8">
        <header>
          <h1 className="font-headline text-4xl md:text-[3rem] leading-none font-bold text-primary tracking-tight mb-2">
            Reports
          </h1>
          <p className="font-body text-on-surface-variant text-base max-w-xl">
            Open a past symptom check from the list, review the pre-visit summary, and download a PDF to share with
            your clinician.
          </p>
        </header>

        {isLoading ? (
          <div className="rounded-xl border border-ghost bg-surface-container-lowest p-10 text-center font-body text-on-surface-variant">
            Loading reports…
          </div>
        ) : isError ? (
          <div
            className="rounded-xl border border-error-container/40 bg-error-container/10 p-6 font-body text-sm text-on-error-container"
            role="alert"
          >
            {error instanceof Error ? error.message : "Could not load reports. Try again later."}
          </div>
        ) : !ordered.length ? (
          <div className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-lowest/80 p-10 md:p-14 text-center">
            <div className="w-14 h-14 rounded-full bg-primary-fixed/15 text-primary mx-auto flex items-center justify-center mb-5">
              <span className="material-symbols-outlined text-[28px]">description</span>
            </div>
            <h2 className="font-headline text-lg font-bold text-on-surface mb-2">No symptom checks yet</h2>
            <p className="font-body text-sm text-on-surface-variant max-w-md mx-auto mb-6">
              Complete a symptom check to build your history here.
            </p>
            <Link
              className="inline-flex items-center gap-2 bg-primary text-on-primary font-headline text-sm font-bold py-3 px-6 rounded-lg shadow-ambient hover:opacity-95 transition-opacity"
              to="/symptom-check"
            >
              Go to symptom check
              <span className="material-symbols-outlined text-lg">arrow_forward</span>
            </Link>
          </div>
        ) : (
          <div className="grid min-w-0 grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:gap-10">
            {deleteSession.isError ? (
              <div
                className="lg:col-span-2 rounded-xl border border-error-container/40 bg-error-container/10 px-4 py-3 font-body text-sm text-on-error-container"
                role="alert"
              >
                {deleteSession.error instanceof Error
                  ? deleteSession.error.message
                  : "Could not delete that report. Try again."}
              </div>
            ) : null}
            <nav
              aria-label="Past symptom checks"
              className="min-w-0 rounded-xl border border-ghost bg-surface-container-lowest shadow-ambient overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-outline-variant/20 bg-surface-container-low/80">
                <p className="font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Drafts — past checks ({ordered.length})
                </p>
              </div>
              <ul className="max-h-[min(70vh,520px)] overflow-y-auto divide-y divide-outline-variant/15">
                {ordered.map((s: SymptomSessionListItem) => {
                  const isActive = s.session_id === selectedId;
                  const deletingThis =
                    deleteSession.isPending && deleteSession.variables === s.session_id;
                  return (
                    <li key={s.session_id} className="group relative flex items-stretch">
                      <button
                        type="button"
                        onClick={() => selectSession(s.session_id)}
                        className={`flex-1 min-w-0 cursor-pointer text-left pl-4 pr-11 py-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
                          isActive
                            ? "bg-primary-fixed/12 border-l-[3px] border-l-primary"
                            : "border-l-[3px] border-l-transparent hover:bg-surface-container-high/80"
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${triageBadgeClasses(s.triage_level)}`}
                          >
                            {triageLabel(s.triage_level)}
                          </span>
                          <span className="font-body text-[11px] text-on-surface-variant">
                            {formatSessionTimestamp(s.created_at)}
                          </span>
                        </div>
                        <p className="font-headline text-sm font-semibold text-on-surface leading-snug line-clamp-2">
                          {patientCheckListLabel(s)}
                        </p>
                      </button>
                      <button
                        type="button"
                        className={
                          deletingThis
                            ? "absolute inset-y-1 right-1 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-error/35 bg-error/10 text-error shadow-sm outline-none transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50 opacity-100 pointer-events-auto"
                            : "absolute inset-y-1 right-1 z-10 flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-error/35 bg-error/10 text-error shadow-sm outline-none transition-opacity focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error disabled:cursor-not-allowed disabled:opacity-50 opacity-100 md:opacity-0 md:pointer-events-none md:group-hover:pointer-events-auto md:group-hover:opacity-100 md:group-focus-within:pointer-events-auto md:group-focus-within:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100 [@media(any-pointer:coarse)]:pointer-events-auto [@media(any-pointer:coarse)]:opacity-100"
                        }
                        aria-label="Delete this report"
                        disabled={deletingThis}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          deleteSession.reset();
                          setConfirmDeleteSessionId(s.session_id);
                        }}
                      >
                        <span className="material-symbols-outlined text-[20px]" aria-hidden>
                          delete
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <article className="min-h-[320px] min-w-0 rounded-xl border border-ghost bg-surface-container-lowest p-5 shadow-ambient md:p-7">
              {selectedId && !selected && isFetching ? (
                <div className="flex flex-col items-center justify-center min-h-[240px] gap-3 text-on-surface-variant font-body text-sm">
                  <div
                    className="h-9 w-9 rounded-full border-2 border-primary border-t-transparent animate-spin"
                    aria-hidden
                  />
                  <p>Loading this report…</p>
                </div>
              ) : selected ? (
                <>
                  <div className="mb-2 flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 shrink sm:max-w-[min(100%,26rem)] sm:pr-2">
                      <h2 className="font-headline text-xl font-bold text-primary mb-1">Pre-visit summary</h2>
                      <p className="font-body text-xs text-on-surface-variant">
                        {formatSessionTimestamp(selected.created_at)}
                      </p>
                    </div>
                    <div className="flex min-w-0 w-full flex-wrap items-center justify-start gap-2 sm:w-auto sm:max-w-full sm:flex-1 sm:justify-end">
                      <button
                        type="button"
                        disabled={pdfBusy}
                        onClick={() => void handleDownloadPdf()}
                        className="inline-flex cursor-pointer items-center gap-2 bg-primary text-on-primary font-headline text-sm font-bold py-2.5 px-4 rounded-lg shadow-ambient hover:opacity-95 transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="material-symbols-outlined text-[20px] shrink-0">download</span>
                        {pdfBusy ? "Preparing…" : "Download PDF"}
                      </button>
                      <Link
                        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border border-outline-variant/40 px-4 py-2 font-body text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high/80"
                        to={`/symptom-check?session=${encodeURIComponent(selected.session_id)}`}
                      >
                        Open in Symptom Check
                        <span className="material-symbols-outlined shrink-0 text-lg leading-none">arrow_forward</span>
                      </Link>
                      <button
                        type="button"
                        disabled={
                          deleteSession.isPending && deleteSession.variables === selected.session_id
                        }
                        onClick={() => {
                          deleteSession.reset();
                          setConfirmDeleteSessionId(selected.session_id);
                        }}
                        className="inline-flex items-center justify-center gap-2 font-body text-sm font-semibold text-error border border-error/40 bg-error/10 rounded-lg py-2 px-4 hover:bg-error/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
                      >
                        <span className="material-symbols-outlined text-[20px] shrink-0">delete</span>
                        Delete report
                      </button>
                    </div>
                  </div>

                  {postVisitDx ? (
                    <section
                      aria-labelledby="reports-post-visit-dx"
                      className="mt-6 rounded-xl border border-secondary/30 bg-secondary-container/15 p-5 md:p-6"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0">
                          <h3
                            id="reports-post-visit-dx"
                            className="font-headline text-sm font-bold uppercase tracking-wider text-secondary mb-2"
                          >
                            Post-visit Diagnosis
                          </h3>
                          <p className="font-body text-sm text-on-surface leading-relaxed">{postVisitDx.text}</p>
                          {postVisitDx.source === "llm_condition" && postVisitDx.matched_condition_title ? (
                            <p className="font-body text-xs text-on-surface-variant mt-2">
                              Matched illustrative condition:{" "}
                              <span className="font-medium text-on-surface">
                                {postVisitDx.matched_condition_title}
                              </span>
                            </p>
                          ) : null}
                        </div>
                        <Link
                          to={`/after-visit/${encodeURIComponent(selected.session_id)}`}
                          className="inline-flex shrink-0 items-center justify-center rounded-lg border border-primary/35 bg-primary-fixed/12 px-4 py-2 font-headline text-xs font-semibold text-primary transition-colors hover:bg-primary-fixed/20"
                        >
                          Update diagnosis
                        </Link>
                      </div>
                    </section>
                  ) : (
                    <section
                      aria-labelledby="reports-post-visit-missing"
                      className="mt-6 rounded-xl border border-dashed border-outline-variant/45 bg-surface-container-low/60 p-5 md:p-6"
                    >
                      <h3
                        id="reports-post-visit-missing"
                        className="font-headline text-sm font-bold text-on-surface"
                      >
                        After your appointment
                      </h3>
                      <p className="mt-2 font-body text-sm leading-relaxed text-on-surface-variant">
                        When you have seen a clinician for this check, record their official diagnosis in
                        one place. It marks the visit complete and can help with future symptom checks.
                      </p>
                      <Link
                        to={`/after-visit/${encodeURIComponent(selected.session_id)}`}
                        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 py-2.5 font-headline text-sm font-semibold text-on-primary shadow-ambient hover:opacity-95"
                      >
                        Record visit diagnosis
                        <span className="material-symbols-outlined text-lg">arrow_forward</span>
                      </Link>
                    </section>
                  )}

                  {!patientView ? (
                    <div className="mt-6 rounded-lg border border-dashed border-outline-variant/40 bg-surface-container-low/50 p-5">
                      <p className="font-body text-sm text-on-surface leading-relaxed mb-3">
                        {selected.summary.trim()
                          ? selected.summary
                          : "No detailed pre-visit summary was saved for this session yet."}
                      </p>
                      <p className="font-body text-xs text-on-surface-variant">
                        You can still download a PDF with the date and urgency above, or continue your check to
                        generate a full summary.
                      </p>
                    </div>
                  ) : (
                    <ReportSectionsView view={patientView} />
                  )}
                </>
              ) : null}
            </article>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportsPage;
