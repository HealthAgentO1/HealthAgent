import { useState } from "react";
import { concisePairwiseExplanation } from "./conciseText";
import { interactionSeverityChipClasses } from "./interactionSeverityStyles";
import type { PairwiseInteractionRow, RegimenSafetyResponse } from "./regimenSafetyClient";

type Props = {
  loading: boolean;
  error: string | null;
  data: RegimenSafetyResponse | null;
};

function ConflictDetailModal({
  row,
  onClose,
}: {
  row: PairwiseInteractionRow;
  onClose: () => void;
}) {
  return (
    <div
      aria-labelledby="conflict-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="bg-surface-container-lowest rounded-xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col border border-outline-variant/20"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-outline-variant/15 flex flex-wrap items-center gap-2 shrink-0">
          <h2 className="text-lg font-headline font-bold text-primary flex-1 min-w-0" id="conflict-detail-title">
            {row.drug_a} + {row.drug_b}
          </h2>
          {row.severity ? (
            <span
              className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full shrink-0 ${interactionSeverityChipClasses(row.severity)}`}
            >
              {row.severity}
            </span>
          ) : null}
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1 text-sm text-on-surface font-body space-y-4">
          {row.direction ? (
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">Source</p>
              <p className="leading-relaxed whitespace-pre-wrap">{row.direction}</p>
            </div>
          ) : null}
          {row.description_plain?.trim() ? (
            <div>
              <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
                Plain-language summary
              </p>
              <p className="leading-relaxed whitespace-pre-wrap break-words">{row.description_plain.trim()}</p>
            </div>
          ) : null}
          <div>
            {row.description_plain?.trim() ? (
              <details className="group">
                <summary className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1 cursor-pointer list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                  <span
                    aria-hidden
                    className="material-symbols-outlined text-base text-on-surface-variant group-open:rotate-90 transition-transform"
                    style={{ fontVariationSettings: "'FILL' 0" }}
                  >
                    chevron_right
                  </span>
                  Original FDA label wording
                </summary>
                <p className="leading-relaxed whitespace-pre-wrap break-words mt-2 pl-6 text-on-surface-variant/95">
                  {row.description?.trim() || "No excerpt stored for this pair."}
                </p>
              </details>
            ) : (
              <>
                <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wide mb-1">
                  Full label excerpt
                </p>
                <p className="leading-relaxed whitespace-pre-wrap break-words">
                  {row.description?.trim() || "No excerpt stored for this pair."}
                </p>
              </>
            )}
          </div>
        </div>
        <div className="px-5 py-3 border-t border-outline-variant/15 shrink-0">
          <button
            className="w-full cursor-pointer px-4 py-2.5 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors"
            onClick={onClose}
            type="button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Right column: only **pairwise drug–drug** conflicts from FDA label text (concise copy + severity).
 * Tap a row for plain-language summary (when the server provides it) and original label text.
 */
export function DrugInteractionConflictsPanel({ loading, error, data }: Props) {
  const [detailRow, setDetailRow] = useState<PairwiseInteractionRow | null>(null);

  if (loading) {
    return (
      <div className="bg-surface-container-low p-5 rounded-xl border border-surface-container-highest animate-pulse">
        <div className="h-5 bg-surface-container-highest rounded w-3/4 mb-3" />
        <div className="h-16 bg-surface-container-highest rounded" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-surface-container-low p-5 rounded-xl border border-error/30">
        <div className="flex items-center gap-2 mb-2">
          <span className="material-symbols-outlined text-error text-xl">error</span>
          <h3 className="text-lg font-headline font-bold text-primary">Medication Conflicts</h3>
        </div>
        <p className="text-sm text-error font-body" role="alert">
          {error}
        </p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const ir = data.interaction_results;
  const pairwiseHits = (ir.pairwise || []).filter((p) => p.has_interaction);

  if (ir.error && String(ir.error).trim() && pairwiseHits.length === 0) {
    return (
      <div className="bg-surface-container-low p-5 rounded-xl border border-secondary-fixed/30">
        <h3 className="text-lg font-headline font-bold text-primary mb-2">Medication Conflicts</h3>
        <p className="text-sm text-on-surface-variant font-body" role="status">
          Interaction check did not complete: {ir.error}
        </p>
      </div>
    );
  }

  if (pairwiseHits.length === 0) {
    return null;
  }

  return (
    <>
      {detailRow ? <ConflictDetailModal onClose={() => setDetailRow(null)} row={detailRow} /> : null}
      <div className="bg-surface-container-low p-5 rounded-xl border border-surface-container-highest relative overflow-hidden">
        <div className="absolute -right-8 -top-8 opacity-[0.07] pointer-events-none">
          <span
            className="material-symbols-outlined text-8xl text-on-surface-variant"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            pharmacy
          </span>
        </div>

        <div className="flex items-center gap-2 mb-3 relative z-10">
          <span
            className="material-symbols-outlined text-secondary text-2xl"
            style={{ fontVariationSettings: "'FILL' 1" }}
          >
            link_off
          </span>
          <h3 className="text-lg font-headline font-bold text-primary">Medication Conflicts</h3>
        </div>

        <p className="text-xs text-on-surface-variant font-body mb-4 relative z-10 border-l-2 border-primary/25 pl-3 leading-snug">
          row for a readable summary when available and the original label wording. Ask your clinician or
          pharmacist about your doses and conditions.
        </p>

        <ul className="space-y-3 relative z-10">
          {pairwiseHits.map((row, idx) => (
            <li key={`${row.drug_a}-${row.drug_b}-${idx}`}>
              <button
                className="w-full text-left bg-surface-container-lowest rounded-lg border border-outline-variant/25 p-4 shadow-sm hover:border-primary/35 hover:bg-surface-container-low/80 transition-colors cursor-pointer"
                onClick={() => setDetailRow(row)}
                type="button"
              >
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-sm font-headline font-semibold text-primary">
                    {row.drug_a} + {row.drug_b}
                  </span>
                  {row.severity ? (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wide px-2.5 py-0.5 rounded-full ${interactionSeverityChipClasses(row.severity)}`}
                    >
                      {row.severity}
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-on-surface font-body leading-relaxed">{concisePairwiseExplanation(row)}</p>
                <p className="text-xs text-primary font-medium mt-2">Tap for details</p>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
