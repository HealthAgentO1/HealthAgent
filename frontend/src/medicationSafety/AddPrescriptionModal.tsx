import { useCallback, useState } from "react";
import { extractMedicationsFromText } from "./medicationExtractClient";
import type { ActiveMedication } from "./types";
import { upsertMedication } from "./medicationRegimenStorage";
import { MedicationNameHeading } from "./MedicationNameHeading";
import { formatExtractedMedicationLabel, getMedicationTitleLines } from "./medicationNames";

type Step = "input" | "details";

type AddPrescriptionModalProps = {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
};

function emptyToNull(s: string): string | null {
  const t = s.trim();
  return t.length > 0 ? t : null;
}

function optStr(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

/**
 * Two-step flow: free-text → DeepSeek extraction via API → optional regimen fields → persist locally.
 */
export function AddPrescriptionModal({ open, onClose, onSaved }: AddPrescriptionModalProps) {
  const [step, setStep] = useState<Step>("input");
  const [freeText, setFreeText] = useState("");
  const [identifiedCommon, setIdentifiedCommon] = useState<string | null>(null);
  const [identifiedScientific, setIdentifiedScientific] = useState<string | null>(null);
  /** Server `name` when the model returns legacy shape only. */
  const [legacyName, setLegacyName] = useState<string | null>(null);
  const [rxnormId, setRxnormId] = useState<string | null>(null);
  const [dosageMg, setDosageMg] = useState("");
  const [frequency, setFrequency] = useState("");
  const [timeToTake, setTimeToTake] = useState("");
  const [refillBefore, setRefillBefore] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Shown when more than one drug was extracted (informational, not a failure). */
  const [multiNotice, setMultiNotice] = useState<string | null>(null);

  const reset = useCallback(() => {
    setStep("input");
    setFreeText("");
    setIdentifiedCommon(null);
    setIdentifiedScientific(null);
    setLegacyName(null);
    setRxnormId(null);
    setDosageMg("");
    setFrequency("");
    setTimeToTake("");
    setRefillBefore("");
    setLoading(false);
    setError(null);
    setMultiNotice(null);
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleIdentify = async () => {
    setError(null);
    const raw = freeText.trim();
    if (!raw) {
      setError("Enter a description of your prescription.");
      return;
    }
    setLoading(true);
    try {
      const res = await extractMedicationsFromText(raw);
      const meds = res.extracted_medications ?? [];
      if (meds.length === 0) {
        setError(
          "No medication could be identified. Try using the drug name (for example “metformin” or “lisinopril”).",
        );
        return;
      }
      const first = meds[0];
      setIdentifiedCommon(optStr(first.common_name));
      setIdentifiedScientific(optStr(first.scientific_name));
      setLegacyName(optStr(first.name));
      setRxnormId(first.rxnorm_id ?? null);
      const preview = getMedicationTitleLines(
        optStr(first.common_name),
        optStr(first.scientific_name),
        optStr(first.name),
      ).primary;
      if (meds.length > 1) {
        const others = meds.slice(1).map((m) => formatExtractedMedicationLabel(m)).join(", ");
        setMultiNotice(`Multiple medications were found. Showing “${preview}”. Also detected: ${others}.`);
      } else {
        setMultiNotice(null);
      }
      setStep("details");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Identification failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitRegimen = () => {
    const lines = getMedicationTitleLines(identifiedCommon, identifiedScientific, legacyName);
    if (!lines.primary.trim() || lines.primary === "Medication") {
      setError("Missing medication name.");
      return;
    }
    const entry: ActiveMedication = {
      id: crypto.randomUUID(),
      name: lines.primary,
      commonName: identifiedCommon,
      scientificName: identifiedScientific,
      rxnormId,
      dosageMg: emptyToNull(dosageMg),
      frequency: emptyToNull(frequency),
      timeToTake: emptyToNull(timeToTake),
      refillBefore: emptyToNull(refillBefore),
      createdAt: new Date().toISOString(),
    };
    upsertMedication(entry);
    onSaved();
    handleClose();
  };

  if (!open) return null;

  return (
    <div
      aria-labelledby="add-prescription-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
    >
      <div className="bg-surface-container-lowest rounded-xl shadow-xl max-w-lg w-full p-6 md:p-8 border border-outline-variant/20 max-h-[90vh] overflow-y-auto">
        <h2
          className="text-xl font-headline font-bold text-primary mb-2"
          id="add-prescription-title"
        >
          Add prescription
        </h2>
        <p className="text-sm text-on-surface-variant font-body mb-6">
          {step === "input"
            ? "Describe what you take in your own words. We will identify the medication name before you add optional details."
            : "Optional details appear as “-” on your regimen if you leave a field blank."}
        </p>

        {step === "input" ? (
          <>
            <label className="block text-sm font-medium text-on-surface mb-2" htmlFor="rx-free-text">
              Prescription description
            </label>
            <textarea
              className="w-full min-h-[120px] rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              id="rx-free-text"
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="e.g. the small white pill for blood pressure"
              value={freeText}
            />
          </>
        ) : (
          <div className="space-y-4">
            {multiNotice ? (
              <p className="text-sm font-body text-secondary bg-secondary-fixed/15 border border-secondary-fixed/30 rounded-lg px-3 py-2">
                {multiNotice}
              </p>
            ) : null}
            <div>
              <p className="text-xs text-on-surface-variant mb-1">Identified medication</p>
              <MedicationNameHeading
                med={{
                  name: legacyName ?? "",
                  commonName: identifiedCommon,
                  scientificName: identifiedScientific,
                }}
                size="detail"
              />
              {rxnormId ? (
                <p className="text-xs text-on-surface-variant mt-2">RxNorm: {rxnormId}</p>
              ) : null}
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="dosage-mg">
                Dosage (mg)
              </label>
              <input
                className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
                id="dosage-mg"
                inputMode="decimal"
                onChange={(e) => setDosageMg(e.target.value)}
                placeholder="Optional"
                type="text"
                value={dosageMg}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="frequency">
                Frequency
              </label>
              <input
                className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
                id="frequency"
                onChange={(e) => setFrequency(e.target.value)}
                placeholder="e.g. 1x daily"
                type="text"
                value={frequency}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="time-take">
                Time to take
              </label>
              <input
                className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
                id="time-take"
                onChange={(e) => setTimeToTake(e.target.value)}
                placeholder="e.g. morning with food"
                type="text"
                value={timeToTake}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-on-surface mb-1" htmlFor="refill">
                Refill (how long before you need a refill)
              </label>
              <input
                className="w-full rounded-lg border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-on-surface font-body text-sm"
                id="refill"
                onChange={(e) => setRefillBefore(e.target.value)}
                placeholder="e.g. 14 days"
                type="text"
                value={refillBefore}
              />
            </div>
          </div>
        )}

        {error ? (
          <p className="mt-4 text-sm font-body text-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col sm:flex-row gap-3 mt-6">
          {step === "input" ? (
            <>
              <button
                className="cursor-pointer gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all sm:flex-1 disabled:opacity-60"
                disabled={loading}
                onClick={() => void handleIdentify()}
                type="button"
              >
                {loading ? "Identifying…" : "Identify medication"}
              </button>
              <button
                className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                onClick={handleClose}
                type="button"
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className="cursor-pointer gradient-primary text-on-primary px-6 py-3 rounded-lg font-headline font-semibold text-sm hover:shadow-[0_4px_12px_rgba(0,55,111,0.2)] transition-all sm:flex-1"
                onClick={handleSubmitRegimen}
                type="button"
              >
                Add to regimen
              </button>
              <button
                className="cursor-pointer px-6 py-3 rounded-lg font-headline font-semibold text-sm border border-outline-variant/40 text-primary hover:bg-surface-container transition-colors sm:flex-1"
                onClick={() => {
                  setStep("input");
                  setError(null);
                }}
                type="button"
              >
                Back
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
