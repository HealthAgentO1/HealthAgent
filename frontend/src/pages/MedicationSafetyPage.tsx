import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AddPrescriptionModal } from "../medicationSafety/AddPrescriptionModal";
import { displayOrDash } from "../medicationSafety/display";
import { DrugInteractionConflictsPanel } from "../medicationSafety/DrugInteractionConflictsPanel";
import { aggregateDrugRiskTier, findPerDrugRow, recallsForProfileMedication } from "../medicationSafety/drugRiskAssessment";
import type { RegimenSafetyResponse } from "../medicationSafety/regimenSafetyClient";
import {
  loadRegimenSafetyCached,
  readCachedRegimenSafety,
  regimenIdentityFingerprint,
} from "../medicationSafety/regimenSafetyCache";
import { MedicationNameHeading } from "../medicationSafety/MedicationNameHeading";
import { loadActiveRegimen } from "../medicationSafety/medicationRegimenStorage";
import type { ActiveMedication } from "../medicationSafety/types";

function formatDosage(mg: string | null): string {
  if (!mg || !mg.trim()) return "-";
  return `${mg.trim()} mg`;
}

function RegimenCard({ med, showHighRiskBadge }: { med: ActiveMedication; showHighRiskBadge: boolean }) {
  return (
    <Link
      className="flex flex-col md:flex-row gap-6 items-start md:items-center relative rounded-xl border-ghost bg-surface-container-lowest p-6 shadow-[0_12px_32px_rgba(24,28,32,0.05)] transition-[box-shadow] duration-200 hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      to={`/medication-safety/med/${med.id}`}
    >
      <div className="bg-primary-fixed p-4 rounded-full flex-shrink-0">
        <span
          className="material-symbols-outlined text-3xl text-on-primary-fixed"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          prescriptions
        </span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-start mb-3 gap-2">
          <div className="flex-1 min-w-0 pr-2">
            <MedicationNameHeading med={med} size="list" />
          </div>
          <span className="bg-secondary-fixed text-on-secondary-fixed text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shrink-0">
            Active
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-container-low p-3 rounded-lg">
          <div>
            <p className="text-xs text-on-surface-variant">Dosage</p>
            <p className="font-semibold text-primary">{formatDosage(med.dosageMg)}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">Frequency</p>
            <p className="font-semibold text-primary">{displayOrDash(med.frequency)}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">Time</p>
            <p className="font-semibold text-primary">{displayOrDash(med.timeToTake)}</p>
          </div>
          <div>
            <p className="text-xs text-on-surface-variant">Refill</p>
            <p className="font-semibold text-primary">{displayOrDash(med.refillBefore)}</p>
          </div>
        </div>
      </div>
      <div className="absolute top-6 right-6 md:static flex items-center gap-2 shrink-0 self-start md:self-center">
        {showHighRiskBadge ? (
          <span
            aria-label="Important safety information — open this medication for details"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-500/20 text-orange-900 text-sm font-black border border-orange-400/50"
            title="Important safety information on detail page"
          >
            !
          </span>
        ) : null}
        <span className="material-symbols-outlined text-on-surface-variant text-2xl">chevron_right</span>
      </div>
    </Link>
  );
}

const MedicationSafetyPage: React.FC = () => {
  const [regimen, setRegimen] = useState<ActiveMedication[]>(() => loadActiveRegimen());
  const [addOpen, setAddOpen] = useState(false);
  const [safetyLoading, setSafetyLoading] = useState(false);
  const [safetyError, setSafetyError] = useState<string | null>(null);
  const [safetyData, setSafetyData] = useState<RegimenSafetyResponse | null>(null);

  const refresh = useCallback(() => {
    setRegimen(loadActiveRegimen());
  }, []);

  /** Identity-only: refetch openFDA when meds are added/removed or identity fields change — not dosage edits. */
  const regimenIdentityKey = useMemo(() => regimenIdentityFingerprint(regimen), [regimen]);

  useEffect(() => {
    if (regimen.length === 0) {
      setSafetyData(null);
      setSafetyError(null);
      setSafetyLoading(false);
      return;
    }
    const fp = regimenIdentityFingerprint(regimen);
    const cached = readCachedRegimenSafety(fp);
    if (cached) {
      setSafetyData(cached);
      setSafetyError(null);
      setSafetyLoading(false);
      return;
    }
    let cancelled = false;
    setSafetyLoading(true);
    setSafetyError(null);
    void loadRegimenSafetyCached(regimen)
      .then((d) => {
        if (!cancelled) {
          setSafetyData(d);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setSafetyData(null);
          setSafetyError(e instanceof Error ? e.message : "Failed to load safety data.");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSafetyLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [regimenIdentityKey]);

  /** Exclamation on the card when SPL/recall tier is **high** (boxed warning, contraindications, Class I recall). */
  const highRiskByMedId = useMemo(() => {
    const m = new Map<string, boolean>();
    if (!safetyData) {
      return m;
    }
    const rows = safetyData.interaction_results.per_drug_label_safety || [];
    const recalls = (safetyData.recalls.recalls || []) as Array<Record<string, unknown>>;
    for (const med of regimen) {
      const row = findPerDrugRow(med.name, rows);
      const mine = recallsForProfileMedication(med.name, recalls);
      const tier = aggregateDrugRiskTier(row, mine);
      m.set(med.id, tier === "high");
    }
    return m;
  }, [regimen, safetyData]);

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12">
      <AddPrescriptionModal
        onClose={() => setAddOpen(false)}
        onSaved={refresh}
        open={addOpen}
      />

      {/* Header */}
      <div className="max-w-6xl mx-auto mb-10">
        <h1 className="text-3xl md:text-5xl font-headline font-extrabold text-primary tracking-tight mb-3">
          Medication Safety
        </h1>
        <p className="text-on-surface-variant font-body text-base max-w-2xl">
          Review your prescriptions and regimen details. Drug–drug conflicts appear on the right; label
          warnings and recalls are on each medication&apos;s detail page.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Medication List */}
        <div className="lg:col-span-2 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="text-xl font-headline font-bold text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">prescriptions</span>
              Active Regimen
            </h3>
            <button
              className="cursor-pointer gradient-primary text-on-primary px-5 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all inline-flex items-center justify-center gap-2 shrink-0"
              onClick={() => setAddOpen(true)}
              type="button"
            >
              <span className="material-symbols-outlined text-lg">add</span>
              Add prescription
            </button>
          </div>
          <div className="flex flex-col gap-4">
            {regimen.length === 0 ? (
              <div className="bg-surface-container-lowest p-8 rounded-xl border border-dashed border-outline-variant/50 text-center">
                <p className="text-on-surface-variant font-body text-sm mb-4">
                  No medications yet. Add a prescription to build your active regimen.
                </p>
                <button
                  className="cursor-pointer gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all"
                  onClick={() => setAddOpen(true)}
                  type="button"
                >
                  Add prescription
                </button>
              </div>
            ) : (
              regimen.map((med) => (
                <RegimenCard
                  key={med.id}
                  med={med}
                  showHighRiskBadge={highRiskByMedId.get(med.id) === true}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: drug–drug interactions */}
        <div>
          <DrugInteractionConflictsPanel
            data={regimen.length === 0 ? null : safetyData}
            error={safetyError}
            loading={safetyLoading && regimen.length > 0}
          />
        </div>
      </div>
    </div>
  );
};

export default MedicationSafetyPage;
