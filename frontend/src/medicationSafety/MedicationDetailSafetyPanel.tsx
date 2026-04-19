import { truncateAtWord } from "./conciseText";
import {
  aggregateDrugRiskTier,
  findPerDrugRow,
  recallsForProfileMedication,
  splSectionRiskTier,
  type DrugRiskTier,
} from "./drugRiskAssessment";
import { drugRiskTierChipClasses } from "./interactionSeverityStyles";
import { SPL_SECTION_DISPLAY_ORDER, titleForSplSectionKey } from "./splSectionTitles";
import type { RegimenSafetyResponse } from "./regimenSafetyClient";

function tierLabel(t: DrugRiskTier): string {
  if (t === "high") {
    return "Higher concern";
  }
  if (t === "moderate") {
    return "Moderate concern";
  }
  return "Informational";
}

type Props = {
  displayName: string;
  data: RegimenSafetyResponse | null;
  loading: boolean;
  error: string | null;
};

/**
 * Per-medication FDA label excerpts + recalls on the edit/detail route (concise by default).
 */
export function MedicationDetailSafetyPanel({ displayName, data, loading, error }: Props) {
  if (loading) {
    return (
      <div className="mt-8 space-y-3 animate-pulse">
        <div className="h-4 bg-surface-container-highest rounded w-1/3" />
        <div className="h-24 bg-surface-container-highest rounded-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-sm text-error font-body">
        {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const rows = data.interaction_results.per_drug_label_safety || [];
  const row = findPerDrugRow(displayName, rows);
  const recalls = recallsForProfileMedication(displayName, (data.recalls.recalls || []) as Array<Record<string, unknown>>);
  const overall = aggregateDrugRiskTier(row, recalls);

  const orderedKeys: string[] = [];
  const sections = row?.sections || {};
  const keys = new Set(Object.keys(sections).filter((k) => sections[k]));
  for (const k of SPL_SECTION_DISPLAY_ORDER) {
    if (!keys.has(k)) {
      continue;
    }
    keys.delete(k);
    if (k.endsWith("_table")) {
      continue;
    }
    orderedKeys.push(k);
  }
  for (const k of keys) {
    if (!k.endsWith("_table")) {
      orderedKeys.push(k);
    }
  }

  return (
    <div className="mt-0 space-y-4">
      <h2 className="text-lg font-headline font-bold text-primary flex items-center gap-2">
        <span className="material-symbols-outlined text-secondary">shield_with_heart</span>
        Safety information
      </h2>
      <p className="text-xs text-on-surface-variant font-body leading-relaxed">
        Summaries from openFDA drug labels and recalls. Not a substitute for professional advice.
      </p>

      {overall ? (
        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${drugRiskTierChipClasses(overall)}`}
        >
          Overall: {tierLabel(overall)}
        </div>
      ) : null}

      {!row?.label_found ? (
        <p className="text-sm text-on-surface-variant font-body">
          {row
            ? `No FDA label was matched for “${displayName}” in openFDA with the current search terms.`
            : "No label row returned for this medication."}
        </p>
      ) : null}

      {row?.label_found && orderedKeys.length > 0 ? (
        <div className="space-y-3">
          {orderedKeys.map((key) => {
            const full = sections[key] || "";
            const tier = splSectionRiskTier(key);
            const preview = truncateAtWord(full, 280);
            return (
              <div
                className="rounded-xl border border-outline-variant/25 bg-surface-container-low/80 overflow-hidden"
                key={key}
              >
                <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/15 bg-surface-container-high/40">
                  <span className="text-sm font-headline font-semibold text-primary pr-2">
                    {titleForSplSectionKey(key)}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0 ${drugRiskTierChipClasses(tier)}`}
                  >
                    {tierLabel(tier)}
                  </span>
                </div>
                <div className="px-4 pb-4">
                  <p className="text-sm text-on-surface font-body leading-relaxed whitespace-pre-wrap mt-3">
                    {preview}
                  </p>
                  {full.length > preview.length ? (
                    <details className="mt-3 text-xs">
                      <summary className="cursor-pointer text-primary font-semibold font-headline">
                        Show full label text
                      </summary>
                      <p className="mt-2 text-on-surface-variant font-body whitespace-pre-wrap max-h-64 overflow-y-auto">
                        {full}
                      </p>
                    </details>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {recalls.length > 0 ? (
        <div className="rounded-xl border border-orange-400/35 bg-orange-500/8 px-4 py-3">
          <h3 className="text-sm font-headline font-semibold text-primary mb-2 flex items-center gap-2">
            <span className="material-symbols-outlined text-lg text-orange-800">published_with_changes</span>
            Enforcement recalls
          </h3>
          <ul className="space-y-2 text-sm text-on-surface font-body">
            {recalls.map((r, i) => (
              <li key={i}>
                {String(r.reason_for_recall || "Recall reported")}
                {r.classification ? ` (Class ${r.classification})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {(data.recalls.errors || []).length > 0 ? (
        <p className="text-xs text-on-surface-variant">
          Recall lookup had partial errors; list above may be incomplete.
        </p>
      ) : null}
    </div>
  );
}
