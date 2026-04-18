import React from "react";

const DashboardPage: React.FC = () => {
  return (
    <div className="p-6 md:p-10 lg:p-12">
      <div className="max-w-6xl mx-auto space-y-8">
        {/* Page Header */}
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 className="font-headline text-4xl md:text-[3.5rem] leading-none font-bold text-primary tracking-tight mb-2">
              Health Hub
            </h1>
            <p className="font-body text-on-surface-variant text-base">
              Your clinical sanctuary for holistic well-being.
            </p>
          </div>
          <div className="flex items-center gap-3 bg-surface-container-lowest px-4 py-2 rounded-full shadow-ambient border-ghost">
            <div className="w-2 h-2 rounded-full bg-secondary"></div>
            <span className="font-body text-sm font-medium text-on-surface">
              All systems optimal
            </span>
          </div>
        </header>

        {/* Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 md:gap-8">
          {/* Care Pathway Hero Card */}
          <div className="col-span-1 md:col-span-12 lg:col-span-8 bg-gradient-to-br from-primary to-primary-container rounded-xl p-8 relative overflow-hidden flex flex-col justify-between min-h-[320px] shadow-ambient">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4"></div>
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-on-primary text-xs font-semibold uppercase tracking-wider mb-6">
                <span className="material-symbols-outlined text-[16px]">
                  directions
                </span>
                Active Care Pathway
              </div>
              <h2 className="font-headline text-3xl md:text-4xl font-bold text-on-primary max-w-lg leading-tight mb-4">
                Complete your pre-assessment for Dr. Hayes.
              </h2>
              <p className="font-body text-primary-fixed-dim text-base max-w-md mb-8">
                Your upcoming Care Match requires a brief symptom log update to
                ensure a precise consultation.
              </p>
            </div>
            <div className="relative z-10 flex items-center gap-4 mt-auto">
              <button className="bg-surface-container-lowest text-primary font-headline font-bold py-3 px-6 rounded shadow-sm hover:shadow-md transition-all flex items-center gap-2">
                Start Assessment
                <span className="material-symbols-outlined text-lg">
                  arrow_forward
                </span>
              </button>
              <button className="text-on-primary font-body font-medium hover:underline px-2">
                Reschedule
              </button>
            </div>
          </div>

          {/* Health Snapshot */}
          <div className="col-span-1 md:col-span-12 lg:col-span-4 bg-surface-container-lowest rounded-xl p-6 shadow-ambient border-ghost flex flex-col gap-6">
            <div className="flex items-center justify-between">
              <h3 className="font-headline text-xl font-bold text-primary">
                Health Snapshot
              </h3>
              <button className="text-outline hover:text-primary transition-colors">
                <span className="material-symbols-outlined">more_horiz</span>
              </button>
            </div>

            {/* Progress Ring */}
            <div className="flex items-center justify-center py-4">
              <div className="relative w-32 h-32 flex items-center justify-center">
                <svg
                  className="w-full h-full transform -rotate-90 absolute"
                  viewBox="0 0 100 100"
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#f1f4f9"
                    strokeWidth="8"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="45"
                    fill="none"
                    stroke="#00696d"
                    strokeWidth="8"
                    strokeDasharray="283"
                    strokeDashoffset="56"
                    className="drop-shadow-sm"
                  />
                </svg>
                <div className="text-center flex flex-col items-center">
                  <span className="font-headline text-3xl font-extrabold text-on-surface">
                    82<span className="text-lg text-outline">%</span>
                  </span>
                  <span className="font-body text-xs text-on-surface-variant font-medium uppercase tracking-widest mt-1">
                    Vitality
                  </span>
                </div>
              </div>
            </div>

            {/* Mini Stats */}
            <div className="flex flex-col gap-4 mt-auto">
              <div className="flex items-start gap-4 p-3 bg-surface-container-low rounded-lg">
                <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    monitor_heart
                  </span>
                </div>
                <div>
                  <p className="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Last Vitals
                  </p>
                  <p className="font-headline text-sm font-bold text-on-surface">
                    BP: 120/80
                    <span className="text-outline font-normal mx-1">|</span>
                    HR: 72 bpm
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4 p-3 bg-surface-container-low rounded-lg">
                <div className="w-8 h-8 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[18px]">
                    prescriptions
                  </span>
                </div>
                <div className="flex-1">
                  <p className="font-body text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                    Active Meds
                  </p>
                  <div className="flex items-center justify-between">
                    <p className="font-headline text-sm font-bold text-on-surface">
                      Lisinopril 10mg
                    </p>
                    <span className="bg-surface-container-lowest text-secondary text-[10px] font-bold px-2 py-0.5 rounded-full border-ghost">
                      On Track
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Activity & Alerts */}
          <div className="col-span-1 md:col-span-12">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-headline text-2xl font-bold text-primary">
                Recent Activity &amp; Alerts
              </h3>
              <a
                className="font-body text-sm font-semibold text-primary hover:text-primary-container transition-colors flex items-center"
                href="#"
              >
                View Full History
                <span className="material-symbols-outlined text-sm ml-1">
                  arrow_forward
                </span>
              </a>
            </div>
            <div className="flex flex-col gap-4">
              {/* Warning Alert */}
              <div className="bg-surface-container-lowest rounded-lg p-5 shadow-ambient border-ghost flex flex-col sm:flex-row sm:items-center gap-5 hover:bg-surface-bright transition-colors duration-200">
                <div className="w-12 h-12 rounded-full bg-error-container text-on-error-container flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined icon-fill">
                    warning
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-headline text-base font-bold text-on-surface">
                      Interaction Warning Detected
                    </h4>
                    <span className="bg-error text-on-error text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Review Required
                    </span>
                  </div>
                  <p className="font-body text-sm text-on-surface-variant">
                    Potential mild interaction between newly prescribed{" "}
                    <strong className="text-on-surface">Amoxicillin</strong> and
                    existing{" "}
                    <strong className="text-on-surface">Lisinopril</strong>.
                  </p>
                </div>
                <div className="mt-4 sm:mt-0 shrink-0">
                  <button className="bg-secondary-container text-on-secondary-container font-headline text-sm font-bold py-2 px-4 rounded hover:opacity-90 transition-opacity w-full sm:w-auto">
                    Consult Pharmacist
                  </button>
                </div>
              </div>

              {/* Info Alert */}
              <div className="bg-surface-container-lowest rounded-lg p-5 shadow-ambient border-ghost flex flex-col sm:flex-row sm:items-center gap-5 hover:bg-surface-bright transition-colors duration-200">
                <div className="w-12 h-12 rounded-full bg-primary-fixed text-on-primary-fixed flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined icon-fill">
                    check_circle
                  </span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-headline text-base font-bold text-on-surface">
                      Lab Results Available
                    </h4>
                    <span className="bg-surface-container-low text-on-surface-variant text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      Today, 9:00 AM
                    </span>
                  </div>
                  <p className="font-body text-sm text-on-surface-variant">
                    Your comprehensive metabolic panel results from Central Lab
                    have been uploaded.
                  </p>
                </div>
                <div className="mt-4 sm:mt-0 shrink-0">
                  <button className="bg-transparent text-primary font-headline text-sm font-bold py-2 px-4 rounded border border-primary hover:bg-primary hover:text-white transition-colors w-full sm:w-auto">
                    View Report
                  </button>
                </div>
              </div>

              {/* Routine Alert */}
              <div className="bg-surface-container-lowest rounded-lg p-5 shadow-ambient border-ghost flex flex-col sm:flex-row sm:items-center gap-5 hover:bg-surface-bright transition-colors duration-200 opacity-80">
                <div className="w-12 h-12 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined">event</span>
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h4 className="font-headline text-base font-bold text-on-surface">
                      Upcoming Appointment Reminder
                    </h4>
                    <span className="bg-surface-container-low text-on-surface-variant text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      In 3 Days
                    </span>
                  </div>
                  <p className="font-body text-sm text-on-surface-variant">
                    Annual physical with Dr. Sarah Jenkins at Oakwood Clinic.
                  </p>
                </div>
                <div className="mt-4 sm:mt-0 shrink-0 flex gap-2">
                  <button className="text-primary font-body text-sm font-semibold hover:underline">
                    Details
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
