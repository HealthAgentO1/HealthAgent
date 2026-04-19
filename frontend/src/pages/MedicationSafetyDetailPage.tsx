import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { displayOrDash } from "../medicationSafety/display";
import { MedicationNameHeading } from "../medicationSafety/MedicationNameHeading";
import { getMedicationTitleLines } from "../medicationSafety/medicationNames";
import {
  getMedicationById,
  removeMedication,
  upsertMedication,
} from "../medicationSafety/medicationRegimenStorage";
import type { ActiveMedication } from "../medicationSafety/types";

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

/**
 * Edit screen for a single regimen entry; removal uses a confirmation dialog (not `window.confirm`).
 */
const MedicationSafetyDetailPage: React.FC = () => {
  const { medicationId } = useParams<{ medicationId: string }>();
  const navigate = useNavigate();
  const med = medicationId ? getMedicationById(medicationId) : undefined;

  const [dosageMg, setDosageMg] = useState(med?.dosageMg ?? "");
  const [frequency, setFrequency] = useState(med?.frequency ?? "");
  const [timeToTake, setTimeToTake] = useState(med?.timeToTake ?? "");
  const [refillBefore, setRefillBefore] = useState(med?.refillBefore ?? "");
  const [confirmRemove, setConfirmRemove] = useState(false);

  // If the route id changes without remounting, resync fields from storage.
  useEffect(() => {
    const m = medicationId ? getMedicationById(medicationId) : undefined;
    if (!m) return;
    setDosageMg(m.dosageMg ?? "");
    setFrequency(m.frequency ?? "");
    setTimeToTake(m.timeToTake ?? "");
    setRefillBefore(m.refillBefore ?? "");
  }, [medicationId]);

  if (!medicationId) {
    return <Navigate replace to="/medication-safety" />;
  }

  if (!med) {
    return <Navigate replace to="/medication-safety" />;
  }

  const handleSave = () => {
    const updated: ActiveMedication = {
      ...med,
      dosageMg: emptyToNull(dosageMg),
      frequency: emptyToNull(frequency),
      timeToTake: emptyToNull(timeToTake),
      refillBefore: emptyToNull(refillBefore),
    };
    upsertMedication(updated);
    navigate("/medication-safety");
  };

  const handleConfirmRemove = () => {
    removeMedication(med.id);
    navigate("/medication-safety");
  };

  const dosagePreview = dosageMg.trim() ? `${dosageMg.trim()} mg` : "-";

  const removeDialogLabel = (() => {
    const { primary, secondary } = getMedicationTitleLines(
      med.commonName,
      med.scientificName,
      med.name,
    );
    return secondary ? `${primary} (${secondary})` : primary;
  })();

  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12">
      {confirmRemove ? (
        <div
          aria-labelledby="remove-med-title"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
          role="dialog"
        >
          <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-md w-full p-6 md:p-8 border border-outline-variant/20">
            <h2 className="text-xl font-headline font-bold text-primary mb-2" id="remove-med-title">
              Remove medication?
            </h2>
            <p className="text-sm text-on-surface-variant font-body mb-6">
              “{removeDialogLabel}” will be removed from your active regimen. This only affects this
              browser.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                className="cursor-pointer bg-error text-on-error px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:bg-[#93000a] transition-colors sm:flex-1"
                onClick={handleConfirmRemove}
                type="button"
              >
                Remove
              </button>
              <button
                className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                onClick={() => setConfirmRemove(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="max-w-2xl mx-auto">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline mb-6"
          to="/medication-safety"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Medication Safety
        </Link>

        <div className={med.rxnormId ? "mb-2" : "mb-8"}>
          <MedicationNameHeading med={med} size="detail" />
        </div>
        {med.rxnormId ? (
          <p className="text-on-surface-variant text-sm mb-8">RxNorm {med.rxnormId}</p>
        ) : null}

        <p className="text-sm text-on-surface-variant mb-6">
          Leave a field blank to show “-” on your regimen. Dosage is stored in mg.
        </p>

        <div className="space-y-4 bg-surface-container-lowest p-6 rounded-xl border border-ghost">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="edit-dosage">
              Dosage (mg)
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
              id="edit-dosage"
              inputMode="decimal"
              onChange={(e) => setDosageMg(e.target.value)}
              placeholder="Optional"
              type="text"
              value={dosageMg}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {dosagePreview}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="edit-frequency">
              Frequency
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
              id="edit-frequency"
              onChange={(e) => setFrequency(e.target.value)}
              type="text"
              value={frequency}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {displayOrDash(frequency)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="edit-time">
              Time to take
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
              id="edit-time"
              onChange={(e) => setTimeToTake(e.target.value)}
              type="text"
              value={timeToTake}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {displayOrDash(timeToTake)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="edit-refill">
              Refill (how long before you need a refill)
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
              id="edit-refill"
              onChange={(e) => setRefillBefore(e.target.value)}
              type="text"
              value={refillBefore}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {displayOrDash(refillBefore)}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-8">
          <button
            className="cursor-pointer gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm sm:flex-1 transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)]"
            onClick={handleSave}
            type="button"
          >
            Save changes
          </button>
          <button
            className="cursor-pointer border border-error/60 text-error px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:bg-error-container/30 sm:flex-1"
            onClick={() => setConfirmRemove(true)}
            type="button"
          >
            Remove from regimen
          </button>
        </div>
      </div>
    </div>
  );
};

export default MedicationSafetyDetailPage;
