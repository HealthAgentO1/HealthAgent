import React, { useState } from "react";
import { Link } from "react-router-dom";
import { isAxiosError } from "axios";
import {
  useCreateManualPriorDiagnosis,
  useDeleteManualPriorDiagnosis,
  useManualPriorDiagnoses,
} from "../api/manualPriorDiagnoses";

const PriorDiagnosesPage: React.FC = () => {
  const { data: rows, isLoading, isError, refetch } = useManualPriorDiagnoses();
  const createMutation = useCreateManualPriorDiagnosis();
  const deleteMutation = useDeleteManualPriorDiagnosis();
  const [draft, setDraft] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const t = draft.trim();
    if (!t) {
      setFormError("Enter a diagnosis or condition name.");
      return;
    }
    try {
      await createMutation.mutateAsync(t);
      setDraft("");
    } catch (err) {
      if (isAxiosError(err) && err.response?.status === 400) {
        const body = err.response.data as { text?: string[] };
        const msg = Array.isArray(body?.text) ? body.text[0] : "Could not save that entry.";
        setFormError(msg);
      } else {
        setFormError("Something went wrong. Try again.");
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 pb-16 md:p-10 lg:p-12">
      <div className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-secondary-fixed-dim/30 bg-secondary-fixed px-3 py-1 text-xs font-semibold uppercase tracking-wide text-on-secondary-fixed">
            <span className="material-symbols-outlined text-sm">clinical_notes</span>
            Health background
          </div>
          <h1 className="font-headline text-3xl font-extrabold tracking-tight text-primary md:text-5xl">
            My prior diagnoses
          </h1>
          <p className="max-w-2xl font-body text-base leading-relaxed text-on-surface-variant">
            Add conditions you were told you have (for example after a clinic or hospital visit).
            If you opt in on{" "}
            <Link
              to="/symptom-check"
              className="font-semibold text-primary underline-offset-2 hover:underline"
            >
              Symptom Check
            </Link>
            , these labels can be sent with your symptoms to the first guided questions step as
            background—not as a new diagnosis today, and only when you check the box.
          </p>
        </header>

        <section
          className="rounded-xl border border-ghost bg-surface-container-lowest p-5 shadow-ambient md:p-6"
          aria-labelledby="prior-dx-add-heading"
        >
          <h2
            className="mb-4 flex items-center gap-2 font-headline text-lg font-bold text-primary md:text-xl"
            id="prior-dx-add-heading"
          >
            <span className="material-symbols-outlined text-[22px] text-secondary">add_circle</span>
            Add a diagnosis
          </h2>
          <p className="max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">
            Use the wording you remember from your clinician. This is not a medical record.
          </p>

          <form
            id="prior-dx-add-form"
            className="mt-4 border-t border-outline-variant/15 pt-4"
            onSubmit={handleAdd}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">
              Label
            </p>
            <div className="mt-2">
              <label className="mb-0.5 block text-sm font-semibold text-on-surface" htmlFor="prior-dx-text">
                Diagnosis or condition
              </label>
              <input
                id="prior-dx-text"
                type="text"
                maxLength={500}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="e.g. Hypertension, seasonal allergies"
                className="w-full rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/55 focus:outline-none focus:ring-2 focus:ring-primary-container"
              />
            </div>
            {formError ? (
              <p className="mt-3 text-sm text-error font-body" role="alert">
                {formError}
              </p>
            ) : null}
            <div className="mt-6">
              <button
                form="prior-dx-add-form"
                type="submit"
                disabled={createMutation.isPending}
                className="gradient-primary cursor-pointer rounded-lg px-5 py-2 font-headline text-sm font-semibold text-on-primary shadow-ambient transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? "Saving…" : "Save to my list"}
              </button>
            </div>
          </form>
        </section>

        <section
          className="rounded-xl border border-ghost bg-surface-container-lowest p-5 shadow-ambient md:p-6"
          aria-labelledby="prior-dx-list-heading"
        >
          <h2
            className="mb-2 flex items-center gap-2 font-headline text-lg font-bold text-primary md:text-xl"
            id="prior-dx-list-heading"
          >
            <span className="material-symbols-outlined text-[22px] text-secondary">list_alt</span>
            Saved labels
          </h2>
          <p className="max-w-2xl font-body text-sm leading-relaxed text-on-surface-variant">
            These entries are merged with official post-visit diagnoses from past checks when you
            include prior diagnoses on Symptom Check (duplicates are removed automatically).
          </p>

          <div className="mt-4 border-t border-outline-variant/15 pt-4">
            {isLoading ? (
              <p className="text-sm text-on-surface-variant font-body">Loading your list…</p>
            ) : isError ? (
              <div className="space-y-3">
                <p className="text-sm text-error font-body" role="alert">
                  Could not load your list.
                </p>
                <button
                  type="button"
                  className="cursor-pointer rounded-lg border border-outline-variant/50 px-5 py-2 font-headline text-sm font-semibold text-primary transition-colors hover:bg-surface-container-high/80"
                  onClick={() => void refetch()}
                >
                  Retry
                </button>
              </div>
            ) : !rows?.length ? (
              <div className="rounded-lg border border-dashed border-outline-variant/45 bg-surface-container-low/60 px-4 py-8 text-center">
                <span className="material-symbols-outlined mb-2 inline-block text-3xl text-on-surface-variant/60">
                  clinical_notes
                </span>
                <p className="font-body text-sm leading-relaxed text-on-surface-variant">
                  Nothing saved yet. Add a label above to use it as optional context on your next
                  symptom check.
                </p>
              </div>
            ) : (
              <ul className="flex flex-col gap-3">
                {rows.map((row) => (
                  <li
                    key={row.diagnosis_id}
                    className="flex flex-col gap-3 rounded-lg border border-outline-variant/30 bg-surface-container-low/50 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <p className="min-w-0 flex-1 font-body text-sm font-medium leading-snug text-on-surface">
                      {row.text}
                    </p>
                    <button
                      type="button"
                      className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-outline-variant/50 px-4 py-2 font-headline text-xs font-semibold text-error transition-colors hover:bg-error-container/25 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={deleteMutation.isPending}
                      onClick={() => void deleteMutation.mutateAsync(row.diagnosis_id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PriorDiagnosesPage;
