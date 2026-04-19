import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { useSymptomSessions, type SymptomSessionListItem } from "../api/queries";
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
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = searchParams.get("session");
  const [pdfBusy, setPdfBusy] = useState(false);
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
    if (!ordered.length) return;

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
      <div className="max-w-6xl mx-auto space-y-8">
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
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(240px,300px)_1fr] gap-6 lg:gap-10 items-start">
            <nav
              aria-label="Past symptom checks"
              className="rounded-xl border border-ghost bg-surface-container-lowest shadow-ambient overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-outline-variant/20 bg-surface-container-low/80">
                <p className="font-headline text-xs font-bold uppercase tracking-wider text-on-surface-variant">
                  Drafts — past checks ({ordered.length})
                </p>
              </div>
              <ul className="max-h-[min(70vh,520px)] overflow-y-auto divide-y divide-outline-variant/15">
                {ordered.map((s: SymptomSessionListItem) => {
                  const isActive = s.session_id === selectedId;
                  return (
                    <li key={s.session_id}>
                      <button
                        type="button"
                        onClick={() => selectSession(s.session_id)}
                        className={`w-full cursor-pointer text-left px-4 py-3.5 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary ${
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
                    </li>
                  );
                })}
              </ul>
            </nav>

            <article className="rounded-xl border border-ghost bg-surface-container-lowest p-5 md:p-7 shadow-ambient min-h-[320px]">
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
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-2">
                    <div>
                      <h2 className="font-headline text-xl font-bold text-primary mb-1">Pre-visit summary</h2>
                      <p className="font-body text-xs text-on-surface-variant">
                        {formatSessionTimestamp(selected.created_at)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={pdfBusy}
                        onClick={() => void handleDownloadPdf()}
                        className="inline-flex cursor-pointer items-center gap-2 bg-primary text-on-primary font-headline text-sm font-bold py-2.5 px-4 rounded-lg shadow-ambient hover:opacity-95 transition-opacity disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <span className="material-symbols-outlined text-[20px]">download</span>
                        {pdfBusy ? "Preparing…" : "Download PDF"}
                      </button>
                      <Link
                        className="inline-flex items-center gap-1 font-body text-sm font-semibold text-primary border border-outline-variant/40 rounded-lg py-2 px-4 hover:bg-surface-container-high/80 transition-colors"
                        to={`/symptom-check?session=${encodeURIComponent(selected.session_id)}`}
                      >
                        Open in Symptom Check
                        <span className="material-symbols-outlined text-lg leading-none">arrow_forward</span>
                      </Link>
                    </div>
                  </div>

                  {postVisitDx ? (
                    <section
                      aria-labelledby="reports-post-visit-dx"
                      className="mt-6 rounded-xl border border-secondary/30 bg-secondary-container/15 p-5 md:p-6"
                    >
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
                    </section>
                  ) : null}

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
