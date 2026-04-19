import React, { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { displayOrDash } from "../medicationSafety/display";
import type { RegimenSafetyResponse } from "../medicationSafety/regimenSafetyClient";
import {
  loadRegimenSafetyCached,
  readCachedRegimenSafety,
  regimenIdentityFingerprint,
} from "../medicationSafety/regimenSafetyCache";
import { MedicationDetailSafetyPanel } from "../medicationSafety/MedicationDetailSafetyPanel";
import { MedicationNameHeading } from "../medicationSafety/MedicationNameHeading";
import { getMedicationTitleLines } from "../medicationSafety/medicationNames";
import {
  getMedicationById,
  loadActiveRegimen,
  removeMedication,
  upsertMedication,
} from "../medicationSafety/medicationRegimenStorage";
import type { ActiveMedication } from "../medicationSafety/types";

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

type EditModalProps = {
  med: ActiveMedication;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

/**
 * Pop-up for dosage, frequency, time, refill — matches prior inline edit behavior.
 */
function EditRegimenModal({ med, open, onClose, onSaved }: EditModalProps) {
  const [dosageMg, setDosageMg] = useState(med.dosageMg ?? "");
  const [frequency, setFrequency] = useState(med.frequency ?? "");
  const [timeToTake, setTimeToTake] = useState(med.timeToTake ?? "");
  const [refillBefore, setRefillBefore] = useState(med.refillBefore ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }
    setDosageMg(med.dosageMg ?? "");
    setFrequency(med.frequency ?? "");
    setTimeToTake(med.timeToTake ?? "");
    setRefillBefore(med.refillBefore ?? "");
  }, [open, med]);

  if (!open) {
    return null;
  }

  const dosagePreview = dosageMg.trim() ? `${dosageMg.trim()} mg` : "-";

  const handleSave = () => {
    const updated: ActiveMedication = {
      ...med,
      dosageMg: emptyToNull(dosageMg),
      frequency: emptyToNull(frequency),
      timeToTake: emptyToNull(timeToTake),
      refillBefore: emptyToNull(refillBefore),
    };
    upsertMedication(updated);
    onSaved();
    onClose();
  };

  return (
    <div
      aria-labelledby="edit-regimen-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      onClick={onClose}
      role="dialog"
    >
      <div
        className="bg-surface-container-lowest rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6 md:p-8 border border-outline-variant/20"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-headline font-bold text-primary mb-2" id="edit-regimen-title">
          Edit regimen
        </h2>
        <p className="text-sm text-on-surface-variant font-body mb-6">
          Leave a field blank to show “-” on your regimen. Dosage is stored in mg.
        </p>

        <div className="space-y-4 bg-surface-container-low p-4 rounded-xl border border-ghost mb-6">
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="modal-edit-dosage">
              Dosage (mg)
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-on-surface font-body text-sm"
              id="modal-edit-dosage"
              inputMode="decimal"
              onChange={(e) => setDosageMg(e.target.value)}
              placeholder="Optional"
              type="text"
              value={dosageMg}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {dosagePreview}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="modal-edit-frequency">
              Frequency
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-on-surface font-body text-sm"
              id="modal-edit-frequency"
              onChange={(e) => setFrequency(e.target.value)}
              type="text"
              value={frequency}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {displayOrDash(frequency)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="modal-edit-time">
              Time to take
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-on-surface font-body text-sm"
              id="modal-edit-time"
              onChange={(e) => setTimeToTake(e.target.value)}
              type="text"
              value={timeToTake}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {displayOrDash(timeToTake)}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="modal-edit-refill">
              Refill (how long before you need a refill)
            </label>
            <input
              className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-lowest px-3 py-2 text-on-surface font-body text-sm"
              id="modal-edit-refill"
              onChange={(e) => setRefillBefore(e.target.value)}
              type="text"
              value={refillBefore}
            />
            <p className="text-xs text-on-surface-variant mt-1">Preview: {displayOrDash(refillBefore)}</p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            className="cursor-pointer gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm sm:flex-1 transition-all hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)]"
            onClick={handleSave}
            type="button"
          >
            Save
          </button>
          <button
            className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Single medication: safety info below the title, edit/remove actions, regimen edits in a modal.
 */
const MedicationSafetyDetailPage: React.FC = () => {
  const { medicationId } = useParams<{ medicationId: string }>();
  const navigate = useNavigate();
  const [, setDataRefresh] = useState(0);
  const med = medicationId ? getMedicationById(medicationId) : undefined;

  const [editOpen, setEditOpen] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [safetyData, setSafetyData] = useState<RegimenSafetyResponse | null>(null);
  const [safetyLoading, setSafetyLoading] = useState(true);
  const [safetyError, setSafetyError] = useState<string | null>(null);

  useEffect(() => {
    const regimen = loadActiveRegimen();
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
          setSafetyError(e instanceof Error ? e.message : "Could not load safety information.");
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
  }, [medicationId]);

  const bump = () => setDataRefresh((x) => x + 1);

  if (!medicationId) {
    return <Navigate replace to="/medication-safety" />;
  }

  if (!med) {
    return <Navigate replace to="/medication-safety" />;
  }

  const handleConfirmRemove = () => {
    removeMedication(med.id);
    navigate("/medication-safety");
  };

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

      <EditRegimenModal
        med={med}
        onClose={() => setEditOpen(false)}
        onSaved={bump}
        open={editOpen}
      />

      <div className="max-w-2xl mx-auto">
        <Link
          className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline mb-6"
          to="/medication-safety"
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back to Medication Safety
        </Link>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between mb-6">
          <div className="min-w-0 flex-1">
            <div className={med.rxnormId ? "mb-2" : undefined}>
              <MedicationNameHeading med={med} size="detail" />
            </div>
            {med.rxnormId ? (
              <p className="text-on-surface-variant text-sm">RxNorm {med.rxnormId}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2 shrink-0 sm:justify-end">
            <button
              className="cursor-pointer inline-flex items-center justify-center gap-2 gradient-primary text-on-primary px-5 py-2.5 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all"
              onClick={() => setEditOpen(true)}
              type="button"
            >
              <span className="material-symbols-outlined text-lg">edit</span>
              Edit
            </button>
            <button
              className="cursor-pointer inline-flex items-center justify-center gap-2 border border-error/60 text-error px-5 py-2.5 rounded-lg font-headline font-semibold text-sm hover:bg-error-container/30"
              onClick={() => setConfirmRemove(true)}
              type="button"
            >
              <span className="material-symbols-outlined text-lg">delete</span>
              Remove
            </button>
          </div>
        </div>

        <MedicationDetailSafetyPanel
          data={safetyData}
          displayName={med.name}
          error={safetyError}
          loading={safetyLoading}
        />
      </div>
    </div>
  );
};

export default MedicationSafetyDetailPage;
