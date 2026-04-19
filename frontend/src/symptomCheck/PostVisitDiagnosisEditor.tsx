import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchSymptomSessionPostVisitDiagnosis } from "../api/queries";
import type { PostVisitDiagnosis } from "./postVisitDiagnosisTypes";
import { OTHER_VALUE, parsePostVisitDiagnosis } from "./postVisitDiagnosisTypes";

export type PostVisitDiagnosisEditorProps = {
  sessionId: string;
  conditionTitles: string[];
  saved: PostVisitDiagnosis | null;
  /**
   * `defer`: Symptom Check — may show “return later” until `allowDeferredEntry`.
   * `immediate`: dedicated after-visit flow — form available as soon as there is no saved row.
   */
  entryMode: "defer" | "immediate";
  /** When `entryMode === "defer"`, mirrors `isPostVisitDiagnosisEligible` (user left results once). */
  allowDeferredEntry?: boolean;
  /**
   * When true, eligible users see a recommended link to `/after-visit/:sessionId` before the
   * inline form (reduces clutter on the long results page).
   */
  offerDedicatedFlow?: boolean;
  onSaved?: (diagnosis: PostVisitDiagnosis) => void;
};

function diagnosisToFormState(
  d: PostVisitDiagnosis,
  titles: string[],
): { select: string; custom: string } {
  if (d.source === "custom") {
    return { select: OTHER_VALUE, custom: d.text };
  }
  const m = d.matched_condition_title?.trim() || d.text.trim();
  if (m && titles.includes(m)) {
    return { select: m, custom: "" };
  }
  return { select: OTHER_VALUE, custom: d.text };
}

/**
 * Record or update the clinician’s official diagnosis (`PATCH /sessions/:id/`).
 * Used on Symptom Check results (deferred entry + optional link to dedicated flow) and on
 * **`/after-visit/:sessionId`** (immediate entry, update supported).
 */
export const PostVisitDiagnosisEditor: React.FC<PostVisitDiagnosisEditorProps> = ({
  sessionId,
  conditionTitles,
  saved,
  entryMode,
  allowDeferredEntry = false,
  offerDedicatedFlow = false,
  onSaved,
}) => {
  const queryClient = useQueryClient();
  const titles = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const t of conditionTitles) {
      const s = t.trim();
      if (!s || seen.has(s)) continue;
      seen.add(s);
      out.push(s);
    }
    return out;
  }, [conditionTitles]);

  const [editing, setEditing] = useState(!saved);
  const [preferInline, setPreferInline] = useState(false);
  const [selectValue, setSelectValue] = useState<string>(() => {
    if (saved) {
      return diagnosisToFormState(saved, titles).select;
    }
    if (titles.length === 0) return OTHER_VALUE;
    return titles[0] ?? OTHER_VALUE;
  });
  const [customText, setCustomText] = useState(() =>
    saved ? diagnosisToFormState(saved, titles).custom : "",
  );

  useEffect(() => {
    if (!saved) {
      setEditing(true);
      setSelectValue(titles.length === 0 ? OTHER_VALUE : titles[0] ?? OTHER_VALUE);
      setCustomText("");
      return;
    }
    if (editing) {
      const next = diagnosisToFormState(saved, titles);
      setSelectValue(next.select);
      setCustomText(next.custom);
    }
  }, [saved, titles, editing]);

  const saveMutation = useMutation({
    mutationFn: (body: PostVisitDiagnosis) =>
      patchSymptomSessionPostVisitDiagnosis(sessionId, body),
    onSuccess: (data) => {
      const parsed = parsePostVisitDiagnosis(data.post_visit_diagnosis);
      if (parsed) onSaved?.(parsed);
      setEditing(false);
      setPreferInline(false);
      void queryClient.invalidateQueries({ queryKey: ["symptom-sessions"] });
      void queryClient.invalidateQueries({ queryKey: ["symptom-session-resume", sessionId] });
    },
  });

  const canEnterForm =
    entryMode === "immediate" || allowDeferredEntry || Boolean(saved);

  const showDeferNotice =
    entryMode === "defer" && !saved && !allowDeferredEntry;

  const showDedicatedCta =
    offerDedicatedFlow &&
    entryMode === "defer" &&
    allowDeferredEntry &&
    !saved &&
    !preferInline;

  if (saved && !editing) {
    return (
      <section
        aria-labelledby="post-visit-diagnosis-saved"
        className="rounded-xl border border-secondary/30 bg-secondary-container/20 p-6 shadow-ambient md:p-8"
      >
        <div className="flex flex-wrap items-start gap-4">
          <span
            className="material-symbols-outlined shrink-0 text-3xl text-secondary"
            style={{ fontVariationSettings: "'FILL' 1" }}
            aria-hidden
          >
            verified
          </span>
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                id="post-visit-diagnosis-saved"
                className="font-headline text-xl font-bold text-primary"
              >
                Official diagnosis on file
              </h2>
              <span className="rounded-full border border-secondary/50 bg-surface-container-lowest px-2 py-0.5 font-headline text-[10px] font-bold uppercase tracking-wider text-secondary">
                Visit complete
              </span>
            </div>
            <p className="font-body text-base leading-relaxed text-on-surface">{saved.text}</p>
            {saved.source === "llm_condition" && saved.matched_condition_title ? (
              <p className="font-body text-xs text-on-surface-variant">
                Linked to illustrative list item:{" "}
                <span className="font-medium text-on-surface">{saved.matched_condition_title}</span>
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="button"
                className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-primary/35 bg-primary-fixed/12 px-4 py-2 font-headline text-sm font-semibold text-primary transition-colors hover:bg-primary-fixed/20"
                onClick={() => {
                  setEditing(true);
                  const next = diagnosisToFormState(saved, titles);
                  setSelectValue(next.select);
                  setCustomText(next.custom);
                }}
              >
                Update diagnosis
              </button>
              <Link
                to={`/reports?session=${encodeURIComponent(sessionId)}`}
                className="inline-flex items-center justify-center rounded-lg border border-outline-variant/45 px-4 py-2 font-headline text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high/80"
              >
                View in Reports
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (showDeferNotice) {
    return (
      <section className="rounded-xl border border-dashed border-outline-variant/45 bg-surface-container-low/60 p-5 md:p-6">
        <div className="flex gap-3">
          <span className="material-symbols-outlined shrink-0 text-2xl text-on-surface-variant" aria-hidden>
            schedule
          </span>
          <div className="min-w-0 space-y-2">
            <h2 className="font-headline text-base font-bold text-on-surface">After your appointment</h2>
            <p className="font-body text-sm leading-relaxed text-on-surface-variant">
              When you have seen a clinician, record their official diagnosis so this check counts as
              complete and can inform future symptom checks. Leave this page once, then open this
              session again from the dashboard or reports — or use the{" "}
              <Link
                to={`/after-visit/${encodeURIComponent(sessionId)}`}
                className="font-semibold text-primary underline-offset-2 hover:underline"
              >
                after-visit form
              </Link>{" "}
              anytime.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (!canEnterForm) {
    return null;
  }

  if (showDedicatedCta) {
    return (
      <section
        aria-labelledby="post-visit-dedicated-cta"
        className="overflow-hidden rounded-xl border border-ghost bg-surface-container-lowest shadow-ambient"
      >
        <div className="border-b border-outline-variant/15 bg-primary-fixed/10 px-5 py-4 md:px-8 md:py-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary">
            <span className="material-symbols-outlined text-lg">event_available</span>
            After your appointment
          </div>
          <h2 id="post-visit-dedicated-cta" className="mt-2 font-headline text-xl font-bold text-primary md:text-2xl">
            Record your clinician&apos;s diagnosis
          </h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">
            This is not the AI list above — it is what your doctor told you. It saves to your account,
            marks this visit complete, and can be used as background on future symptom checks when you
            opt in.
          </p>
        </div>
        <div className="flex flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between md:px-8 md:py-7">
          <Link
            to={`/after-visit/${encodeURIComponent(sessionId)}`}
            className="gradient-primary inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-6 py-3 font-headline text-sm font-semibold text-on-primary shadow-ambient transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] md:w-auto"
          >
            Open after-visit form
            <span className="material-symbols-outlined text-lg">arrow_forward</span>
          </Link>
          <button
            type="button"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-outline-variant/50 px-5 py-2.5 font-headline text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high/80 md:w-auto"
            onClick={() => {
              setPreferInline(true);
              if (saved) {
                const next = diagnosisToFormState(saved, titles);
                setSelectValue(next.select);
                setCustomText(next.custom);
              }
            }}
          >
            Enter it here instead
          </button>
        </div>
      </section>
    );
  }

  const canSubmit =
    selectValue === OTHER_VALUE
      ? customText.trim().length > 0
      : titles.includes(selectValue) || selectValue.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || saveMutation.isPending) return;

    if (selectValue === OTHER_VALUE) {
      const text = customText.trim();
      if (!text) return;
      saveMutation.mutate({
        text,
        source: "custom",
        matched_condition_title: null,
      });
      return;
    }

    saveMutation.mutate({
      text: selectValue,
      source: "llm_condition",
      matched_condition_title: selectValue,
    });
  };

  const handleCancelEdit = () => {
    if (saved) {
      setEditing(false);
      const next = diagnosisToFormState(saved, titles);
      setSelectValue(next.select);
      setCustomText(next.custom);
    }
  };

  return (
    <section
      aria-labelledby="post-visit-diagnosis-form"
      className="rounded-xl border border-ghost bg-surface-container-lowest p-6 shadow-ambient md:p-8"
    >
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
            <span className="material-symbols-outlined text-base text-secondary">clinical_notes</span>
            Post-visit
          </div>
          <h2 id="post-visit-diagnosis-form" className="font-headline text-xl font-bold text-primary md:text-2xl">
            {saved ? "Update official diagnosis" : "Official diagnosis after your visit"}
          </h2>
          <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">
            Choose the label your clinician used, or Other if it was not in the illustrative list from
            this check. Only you can edit this; it is stored with this symptom session.
          </p>
        </div>
        {saved && editing ? (
          <button
            type="button"
            className="shrink-0 rounded-lg border border-outline-variant/50 px-4 py-2 font-headline text-sm font-semibold text-primary hover:bg-surface-container-high/80"
            onClick={handleCancelEdit}
          >
            Cancel
          </button>
        ) : null}
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="rounded-xl border border-outline-variant/25 bg-surface p-4 md:p-5">
          <label
            className="mb-2 block font-headline text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
            htmlFor="post-visit-diagnosis-select"
          >
            Diagnosis from your visit
          </label>
          <select
            id="post-visit-diagnosis-select"
            className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary-container"
            value={selectValue}
            onChange={(ev) => setSelectValue(ev.target.value)}
            disabled={saveMutation.isPending}
          >
            {titles.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={OTHER_VALUE}>Other — type what your clinician said…</option>
          </select>
        </div>

        {selectValue === OTHER_VALUE ? (
          <div className="rounded-xl border border-outline-variant/25 bg-surface p-4 md:p-5">
            <label
              htmlFor="post-visit-custom-diagnosis"
              className="mb-2 block font-headline text-xs font-semibold uppercase tracking-wide text-on-surface-variant"
            >
              Exact wording (recommended)
            </label>
            <input
              id="post-visit-custom-diagnosis"
              type="text"
              className="w-full rounded-lg border border-outline-variant bg-surface-container-lowest px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/55 focus:outline-none focus:ring-2 focus:ring-primary-container"
              placeholder="e.g. Acute otitis media"
              value={customText}
              onChange={(ev) => setCustomText(ev.target.value)}
              disabled={saveMutation.isPending}
              autoComplete="off"
            />
          </div>
        ) : null}

        {saveMutation.isError ? (
          <p className="font-body text-sm text-error" role="alert">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Could not save diagnosis."}
          </p>
        ) : null}

        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="submit"
            className="gradient-primary inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg px-6 py-2.5 font-headline text-sm font-semibold text-on-primary shadow-ambient transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canSubmit || saveMutation.isPending}
          >
            {saveMutation.isPending ? "Saving…" : saved ? "Save changes" : "Save official diagnosis"}
          </button>
          {entryMode === "immediate" ? (
            <Link
              to={`/reports?session=${encodeURIComponent(sessionId)}`}
              className="inline-flex min-h-11 items-center justify-center rounded-lg border border-outline-variant/50 px-5 py-2.5 text-center font-headline text-sm font-semibold text-primary hover:bg-surface-container-high/80"
            >
              Back to Reports
            </Link>
          ) : null}
        </div>
      </form>
    </section>
  );
};
