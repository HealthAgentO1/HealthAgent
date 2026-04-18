import React from "react";

const medications = [
  {
    name: "Lisinopril",
    type: "ACE Inhibitor • Blood Pressure Management",
    icon: "medication",
    status: "active" as const,
    dosage: "10mg",
    frequency: "1x Daily",
    time: "Morning",
    extra: { label: "Refill In", value: "14 Days" },
  },
  {
    name: "Ibuprofen",
    type: "NSAID • Pain Relief",
    icon: "warning",
    status: "alert" as const,
    dosage: "400mg",
    frequency: "As needed",
    time: "N/A",
    extra: { label: "Status", value: "Review Required", isError: true },
  },
  {
    name: "Atorvastatin",
    type: "Statin • Cholesterol Management",
    icon: "vaccines",
    status: "active" as const,
    dosage: "20mg",
    frequency: "1x Daily",
    time: "Evening",
    extra: { label: "Refill In", value: "45 Days" },
  },
];

const MedicationSafetyPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-10">
        <h1 className="text-3xl md:text-5xl font-headline font-extrabold text-primary tracking-tight mb-3">
          Medication Safety
        </h1>
        <p className="text-on-surface-variant font-body text-base max-w-2xl">
          Review your current prescriptions, active dosages, and monitor for
          potential interaction risks.
        </p>
      </div>

      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left: Medication List */}
        <div className="lg:col-span-2 space-y-6">
          <h3 className="text-xl font-headline font-bold text-primary mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary">
              prescriptions
            </span>
            Active Regimen
          </h3>
          <div className="flex flex-col gap-4">
            {medications.map((med, idx) => (
              <div
                key={idx}
                className={`bg-surface-container-lowest p-6 rounded-xl shadow-ambient border-ghost flex flex-col md:flex-row gap-6 items-start md:items-center relative overflow-hidden`}
              >
                {med.status === "alert" && (
                  <div className="absolute left-0 top-0 bottom-0 w-1 bg-error"></div>
                )}
                <div
                  className={`${
                    med.status === "alert"
                      ? "bg-error-container"
                      : "bg-primary-fixed"
                  } p-4 rounded-full flex-shrink-0`}
                >
                  <span
                    className={`material-symbols-outlined text-3xl ${
                      med.status === "alert"
                        ? "text-on-error-container"
                        : "text-on-primary-fixed"
                    }`}
                    style={{ fontVariationSettings: "'FILL' 1" }}
                  >
                    {med.icon}
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="text-lg font-headline font-bold text-on-surface">
                      {med.name}
                    </h4>
                    {med.status === "active" ? (
                      <span className="bg-secondary-fixed text-on-secondary-fixed text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                        Active
                      </span>
                    ) : (
                      <span className="bg-error-container text-on-error-container text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <span className="material-symbols-outlined text-[14px]">
                          priority_high
                        </span>
                        Alert
                      </span>
                    )}
                  </div>
                  <p className="text-on-surface-variant text-sm mb-3">
                    {med.type}
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-surface-container-low p-3 rounded-lg">
                    <div>
                      <p className="text-xs text-on-surface-variant">Dosage</p>
                      <p className="font-semibold text-primary">
                        {med.dosage}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant">
                        Frequency
                      </p>
                      <p className="font-semibold text-primary">
                        {med.frequency}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant">Time</p>
                      <p className="font-semibold text-primary">{med.time}</p>
                    </div>
                    <div>
                      <p className="text-xs text-on-surface-variant">
                        {med.extra.label}
                      </p>
                      <p
                        className={`font-semibold ${
                          med.extra.isError ? "text-error" : "text-primary"
                        }`}
                      >
                        {med.extra.value}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Safety Alerts */}
        <div className="space-y-6">
          {/* Interaction Alert */}
          <div className="bg-error-container p-6 rounded-xl shadow-sm border border-[#ffb4ab] flex flex-col relative overflow-hidden">
            <div className="absolute -right-10 -top-10 opacity-10">
              <span
                className="material-symbols-outlined text-9xl text-error"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                warning
              </span>
            </div>
            <div className="flex items-center gap-3 mb-4 relative z-10">
              <span
                className="material-symbols-outlined text-error text-2xl"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                error
              </span>
              <h3 className="text-xl font-headline font-bold text-on-error-container">
                Interaction Detected
              </h3>
            </div>
            <div className="bg-surface-container-lowest p-4 rounded-lg border-ghost mb-4 relative z-10">
              <div className="flex justify-between items-center mb-2">
                <span className="font-bold text-primary">Lisinopril</span>
                <span className="material-symbols-outlined text-error">
                  close
                </span>
                <span className="font-bold text-primary">Ibuprofen</span>
              </div>
              <div className="w-full bg-surface-container-highest h-1 rounded-full mb-3">
                <div className="bg-error h-1 rounded-full w-full"></div>
              </div>
              <p className="text-sm text-on-surface-variant font-medium">
                Moderate Severity Risk
              </p>
            </div>
            <p className="text-on-error-container text-sm leading-relaxed mb-6 relative z-10">
              Combining NSAIDs (Ibuprofen) with ACE inhibitors (Lisinopril) can
              decrease the effectiveness of the blood pressure medication and
              potentially impact kidney function.
            </p>
            <button className="w-full bg-error text-on-error py-3 rounded font-semibold font-headline hover:bg-[#93000a] transition-colors relative z-10">
              Review Alternatives
            </button>
          </div>

          {/* Safer Alternative */}
          <div className="bg-surface-container-low p-6 rounded-xl border border-surface-container-highest">
            <h3 className="text-lg font-headline font-bold text-primary mb-3 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">
                health_and_safety
              </span>
              Safer Alternative
            </h3>
            <p className="text-sm text-on-surface-variant mb-4">
              Consider discussing Acetaminophen with your care provider for pain
              management while on Lisinopril.
            </p>
            <div className="bg-surface-container-lowest p-3 rounded-lg flex items-center gap-3 mb-4 border-ghost">
              <div className="bg-secondary-fixed p-2 rounded-full">
                <span
                  className="material-symbols-outlined text-on-secondary-fixed text-sm"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  done
                </span>
              </div>
              <div>
                <p className="font-semibold text-sm text-on-surface">
                  Acetaminophen
                </p>
                <p className="text-xs text-on-surface-variant">
                  No known interaction
                </p>
              </div>
            </div>
            <button className="w-full bg-surface-container-lowest text-primary py-2 rounded font-semibold text-sm border-ghost hover:bg-surface-container-high transition-colors">
              Message Care Team
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MedicationSafetyPage;
