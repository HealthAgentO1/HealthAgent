import React, { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { fetchSymptomSessionResume } from "../api/queries";
import { PostVisitDiagnosisEditor } from "../symptomCheck/PostVisitDiagnosisEditor";
import { parseJsonObjectFromLlm } from "../symptomCheck/parseLlmJson";
import { validateSymptomResultsPayload } from "../symptomCheck/validatePayloads";
import { parsePostVisitDiagnosis } from "../symptomCheck/postVisitDiagnosisTypes";
import type { PostVisitDiagnosis } from "../symptomCheck/postVisitDiagnosisTypes";

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

const AfterVisitPage: React.FC = () => {
  const { sessionId = "" } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const sid = sessionId.trim();

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["symptom-session-resume", sid],
    queryFn: () => fetchSymptomSessionResume(sid),
    enabled: Boolean(sid),
  });

  const postVisit = useMemo(
    () => (data ? parsePostVisitDiagnosis(data.post_visit_diagnosis ?? null) : null),
    [data],
  );

  const conditionTitles = useMemo(() => {
    if (!data?.results_raw_text) return [];
    try {
      const parsed = parseJsonObjectFromLlm(data.results_raw_text);
      const validated = validateSymptomResultsPayload(parsed);
      return validated.conditions.map((c) => c.title);
    } catch {
      return [];
    }
  }, [data?.results_raw_text]);

  const [localSaved, setLocalSaved] = React.useState<PostVisitDiagnosis | null>(null);
  React.useEffect(() => {
    setLocalSaved(postVisit);
  }, [postVisit]);

  if (!sid) {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-lg rounded-xl border border-error-container/30 bg-error-container/10 p-6 font-body text-sm text-on-error-container">
          Missing session id.
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-2xl rounded-xl border border-ghost bg-surface-container-lowest p-10 text-center font-body text-on-surface-variant shadow-ambient">
          Loading this visit…
        </div>
      </div>
    );
  }

  if (isError || !data) {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    const is404 = status === 404;
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10">
        <div className="mx-auto max-w-lg space-y-4 rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-6 shadow-ambient">
          <h1 className="font-headline text-lg font-bold text-primary">
            {is404 ? "We could not open that visit" : "Something went wrong"}
          </h1>
          <p className="font-body text-sm leading-relaxed text-on-surface-variant">
            {is404
              ? "This link may be wrong, or the check belongs to another account."
              : "Try again in a moment, or open the check from Reports."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/reports"
              className="inline-flex rounded-lg border border-outline-variant/50 px-4 py-2 font-headline text-sm font-semibold text-primary hover:bg-surface-container-high/80"
            >
              Reports
            </Link>
            <button
              type="button"
              className="inline-flex rounded-lg border border-outline-variant/50 px-4 py-2 font-headline text-sm font-semibold text-primary hover:bg-surface-container-high/80"
              onClick={() => void refetch()}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!data.results_raw_text?.trim()) {
    return (
      <div className="flex-1 overflow-y-auto p-6 md:p-10 lg:p-12">
        <div className="mx-auto max-w-xl space-y-4">
          <Link
            to="/reports"
            className="inline-flex items-center gap-1 font-body text-sm font-semibold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Back to Reports
          </Link>
          <div className="rounded-xl border border-ghost bg-surface-container-lowest p-6 shadow-ambient md:p-8">
            <h1 className="font-headline text-xl font-bold text-primary">No results on this check</h1>
            <p className="mt-2 font-body text-sm leading-relaxed text-on-surface-variant">
              The after-visit diagnosis step needs a completed symptom check with results. Open this
              session in Symptom Check to continue, or pick another visit in Reports.
            </p>
            <button
              type="button"
              className="mt-4 inline-flex rounded-lg bg-primary px-5 py-2.5 font-headline text-sm font-semibold text-on-primary"
              onClick={() => navigate(`/symptom-check?session=${encodeURIComponent(sid)}`)}
            >
              Open in Symptom Check
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-16 md:p-10 lg:p-12">
      <div className="mx-auto max-w-2xl space-y-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Link
            to={`/reports?session=${encodeURIComponent(sid)}`}
            className="inline-flex items-center gap-1 font-body text-sm font-semibold text-primary hover:underline"
          >
            <span className="material-symbols-outlined text-lg">arrow_back</span>
            Reports
          </Link>
          <Link
            to={`/symptom-check?session=${encodeURIComponent(sid)}`}
            className="inline-flex items-center gap-1 font-body text-sm font-semibold text-on-surface-variant hover:text-primary"
          >
            Open full results
            <span className="material-symbols-outlined text-lg">open_in_new</span>
          </Link>
        </div>

        <header className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary-fixed-dim/30 bg-secondary-fixed px-3 py-1 text-xs font-semibold uppercase tracking-wide text-on-secondary-fixed">
            <span className="material-symbols-outlined text-sm">event_available</span>
            After your appointment
          </div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary md:text-4xl">
            Record your diagnosis
          </h1>
          <p className="max-w-xl font-body text-sm leading-relaxed text-on-surface-variant">
            Symptom check from{" "}
            <span className="font-medium text-on-surface">{formatSessionTimestamp(data.created_at)}</span>
            . Save what your clinician told you — separate from the AI&apos;s illustrative list.
          </p>
        </header>

        <PostVisitDiagnosisEditor
          sessionId={sid}
          conditionTitles={conditionTitles}
          saved={localSaved}
          entryMode="immediate"
          offerDedicatedFlow={false}
          onSaved={(d) => setLocalSaved(d)}
        />
      </div>
    </div>
  );
};

export default AfterVisitPage;
