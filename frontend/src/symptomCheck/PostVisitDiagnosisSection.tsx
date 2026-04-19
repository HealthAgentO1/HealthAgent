import React, { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { patchSymptomSessionPostVisitDiagnosis } from "../api/queries";
import type { PostVisitDiagnosis } from "./postVisitDiagnosisTypes";
import { OTHER_VALUE, parsePostVisitDiagnosis } from "./postVisitDiagnosisTypes";

type Props = {
  sessionId: string;
  /** Titles from the LLM differential list (`results.conditions[].title`). */
  conditionTitles: string[];
  /** Loaded from the server; when set, the session is treated as complete. */
  saved: PostVisitDiagnosis | null;
  /** When false, the user has not left and returned yet — hide the entry form. */
  showEntryForm: boolean;
  onSaved?: (diagnosis: PostVisitDiagnosis) => void;
};

/**
 * After a real visit, the patient records the clinician’s diagnosis. Options mirror the
 * illustrative LLM list plus a free-text path when the real diagnosis was not listed.
 */
export const PostVisitDiagnosisSection: React.FC<Props> = ({
  sessionId,
  conditionTitles,
  saved,
  showEntryForm,
  onSaved,
}) => {
  const queryClient = useQueryClient();
  const [selectValue, setSelectValue] = useState<string>(() => {
    if (conditionTitles.length === 0) return OTHER_VALUE;
    return conditionTitles[0] ?? OTHER_VALUE;
  });
  const [customText, setCustomText] = useState("");

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

  const saveMutation = useMutation({
    mutationFn: (body: PostVisitDiagnosis) => patchSymptomSessionPostVisitDiagnosis(sessionId, body),
    onSuccess: (data) => {
      const parsed = parsePostVisitDiagnosis(data.post_visit_diagnosis);
      if (parsed) onSaved?.(parsed);
      void queryClient.invalidateQueries({ queryKey: ["symptom-sessions"] });
    },
  });

  if (saved) {
    return (
      <section
        aria-labelledby="post-visit-diagnosis-saved"
        className="bg-secondary-container/25 border border-secondary/30 rounded-xl p-6 md:p-8 shadow-ambient"
      >
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <span
            className="material-symbols-outlined text-secondary shrink-0"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            verified
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="post-visit-diagnosis-saved"
              className="text-xl font-headline font-bold text-primary mb-1 flex flex-wrap items-center gap-2"
            >
              Official diagnosis recorded
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-secondary/50 bg-surface-container-lowest text-secondary">
                Visit complete
              </span>
            </h2>
            <p className="font-body text-sm text-on-surface leading-relaxed">{saved.text}</p>
            {saved.source === "llm_condition" && saved.matched_condition_title ? (
              <p className="font-body text-xs text-on-surface-variant mt-2">
                Linked to illustrative list item:{" "}
                <span className="font-medium text-on-surface">{saved.matched_condition_title}</span>
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  if (!showEntryForm) {
    return (
      <section className="rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low/50 p-5">
        <p className="font-body text-sm text-on-surface-variant leading-relaxed">
          After you leave this page, you can open this symptom check again from the dashboard or
          reports to record your clinician&apos;s official diagnosis and mark this visit complete.
        </p>
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

  return (
    <section
      aria-labelledby="post-visit-diagnosis-form"
      className="bg-surface-container-lowest rounded-xl p-6 md:p-8 shadow-ambient border border-outline-variant/20"
    >
      <h2
        id="post-visit-diagnosis-form"
        className="text-xl font-headline font-bold text-primary mb-2 flex items-center gap-2"
      >
        <span className="material-symbols-outlined text-secondary">prescriptions</span>
        Official diagnosis after your visit
      </h2>
      <p className="text-sm text-on-surface-variant font-body mb-6 leading-relaxed">
        Select the diagnosis your clinician gave you, or choose &quot;Other&quot; if it wasn&apos;t
        among the illustrative conditions above. This is saved to your account and appears on your
        reports.
      </p>

      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 font-headline">
            Doctor&apos;s diagnosis
          </label>
          <select
            className="w-full rounded-lg border border-outline-variant/40 bg-surface px-4 py-3 font-body text-sm text-on-surface focus:outline focus:outline-2 focus:outline-primary"
            value={selectValue}
            onChange={(ev) => setSelectValue(ev.target.value)}
            disabled={saveMutation.isPending}
          >
            {titles.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
            <option value={OTHER_VALUE}>Other (type your diagnosis)…</option>
          </select>
        </div>

        {selectValue === OTHER_VALUE ? (
          <div>
            <label
              htmlFor="post-visit-custom-diagnosis"
              className="block text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2 font-headline"
            >
              Describe the diagnosis
            </label>
            <input
              id="post-visit-custom-diagnosis"
              type="text"
              className="w-full rounded-lg border border-outline-variant/40 bg-surface px-4 py-3 font-body text-sm text-on-surface placeholder:text-on-surface-variant/60 focus:outline focus:outline-2 focus:outline-primary"
              placeholder="e.g. Acute otitis media"
              value={customText}
              onChange={(ev) => setCustomText(ev.target.value)}
              disabled={saveMutation.isPending}
              autoComplete="off"
            />
          </div>
        ) : null}

        {saveMutation.isError ? (
          <p className="text-sm text-error font-body" role="alert">
            {saveMutation.error instanceof Error
              ? saveMutation.error.message
              : "Could not save diagnosis."}
          </p>
        ) : null}

        <button
          type="submit"
          className="cursor-pointer gradient-primary text-on-primary px-6 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all disabled:opacity-50 disabled:pointer-events-none"
          disabled={!canSubmit || saveMutation.isPending}
        >
          {saveMutation.isPending ? "Saving…" : "Save official diagnosis"}
        </button>
      </form>
    </section>
  );
};
