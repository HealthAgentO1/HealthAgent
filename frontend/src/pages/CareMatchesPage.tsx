import React, { useState, useMemo } from "react";
import { useBookAppointment, useProviders, Provider } from "../api/queries";

type TriageLevel = 'emergency' | 'urgent' | 'routine';

interface UrgencyBannerConfig {
  icon: string;
  title: string;
  description: string;
  bgColor: string;
  borderColor: string;
  iconColor: string;
}

const getUrgencyBannerConfig = (level: TriageLevel): UrgencyBannerConfig => {
  const configs: Record<TriageLevel, UrgencyBannerConfig> = {
    emergency: {
      icon: 'emergency',
      title: 'EMERGENCY - Seek Immediate Care',
      description: 'Your symptoms require immediate medical evaluation. Call 911 or go to the nearest emergency room right now.',
      bgColor: 'bg-error/10',
      borderColor: 'border-error',
      iconColor: 'text-error',
    },
    urgent: {
      icon: 'priority_high',
      title: 'URGENT Care Needed',
      description: 'Your symptoms require prompt medical attention within the next few hours. Please contact a healthcare provider or visit an urgent care facility.',
      bgColor: 'bg-warning/10',
      borderColor: 'border-warning',
      iconColor: 'text-warning',
    },
    routine: {
      icon: 'check_circle',
      title: 'Routine Care Recommended',
      description: 'Your symptoms can be addressed through routine care. Schedule an appointment with your primary care provider or a specialist.',
      bgColor: 'bg-secondary/10',
      borderColor: 'border-secondary',
      iconColor: 'text-secondary',
    },
  };
  return configs[level];
};

const CareMatchesPage: React.FC = () => {
  const [bookingProvider, setBookingProvider] = useState<string | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [triageLevel, setTriageLevel] = useState<TriageLevel>('routine');
  const [zipCode, setZipCode] = useState('94107'); // Default to San Francisco area
  const [specialty, setSpecialty] = useState<string>('');
  const [bookingDetails, setBookingDetails] = useState<{
    providerName: string;
    specialty: string;
    confirmationNumber: string;
    nextAvail: string;
  } | null>(null);
  
  const bookAppointmentMutation = useBookAppointment();
  const { data: liveProviders = [], isLoading, error } = useProviders(zipCode, specialty || undefined);

  // Mock session ID - in real app this would come from routing or context
  const sessionId = 1; // TODO: Get from actual session
  
  const urgencyConfig = getUrgencyBannerConfig(triageLevel);

  const handleBookAppointment = (provider: Provider) => {
    setBookingProvider(provider.name);
    bookAppointmentMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setBookingDetails({
          providerName: provider.name,
          specialty: provider.specialty,
          confirmationNumber: data.confirmation_number,
          nextAvail: 'Contact office for availability',
        });
        setShowConfirmation(true);
        setBookingProvider(null);
      },
      onError: (error) => {
        console.error("Failed to book appointment:", error);
        setBookingProvider(null);
        // In real app, show error message
      },
    });
  };
  return (
    <div className="p-6 md:p-12 max-w-7xl mx-auto w-full">
      {/* Urgency Banner */}
      <div className={`${urgencyConfig.bgColor} rounded-2xl border-2 ${urgencyConfig.borderColor} p-6 mb-10 relative overflow-hidden`}>
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-current/5 rounded-full blur-3xl pointer-events-none" />
        <div className="flex items-start gap-4 relative z-10">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${urgencyConfig.bgColor}`}>
            <span className={`material-symbols-outlined text-2xl ${urgencyConfig.iconColor}`}>
              {urgencyConfig.icon}
            </span>
          </div>
          <div className="flex-1">
            <h2 className={`text-lg md:text-xl font-headline font-bold ${urgencyConfig.iconColor} mb-2`}>
              {urgencyConfig.title}
            </h2>
            <p className="text-on-surface-variant text-sm leading-relaxed">
              {urgencyConfig.description}
            </p>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold uppercase tracking-wider mb-4 border border-secondary-fixed-dim/30">
            <span className="material-symbols-outlined text-sm">
              calendar_clock
            </span>
            Care Recommendations
          </div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold text-primary tracking-tight mb-2">
            Recommended Providers
          </h1>
          <p className="text-on-surface-variant font-body text-base max-w-2xl">
            Based on your triage results, we have identified specialized
            providers to assist with your healthcare needs.
          </p>
        </div>
      </header>

      {/* Bento Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 md:gap-8">
        {/* Left: Triage Summary */}
        <div className="lg:col-span-4 flex flex-col gap-6">
          <section className="bg-surface-container-lowest rounded-xl p-6 shadow-ambient border-ghost relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-secondary/10 rounded-full blur-2xl pointer-events-none"></div>
            <h2 className="text-xl font-headline font-bold text-primary mb-6 flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary">
                summarize
              </span>
              Triage Summary
            </h2>
            <div className="space-y-5">
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant">
                    monitor_heart
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">
                    Primary Concern
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                    Persistent mild fatigue and occasional joint stiffness
                    reported over the last 3 weeks.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-surface-container-low flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-on-surface-variant">
                    history
                  </span>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-on-surface">
                    Clinical Context
                  </h3>
                  <p className="text-sm text-on-surface-variant mt-1 leading-relaxed">
                    No immediate acute symptoms. History suggests evaluating
                    inflammatory markers.
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-5 border-t border-surface-container-highest/50">
                <h3 className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3">
                  Recommended Actions
                </h3>
                <ul className="space-y-2">
                  <li className="flex items-center gap-2 text-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-base">
                      check_circle
                    </span>
                    Schedule standard consultation
                  </li>
                  <li className="flex items-center gap-2 text-sm text-on-surface">
                    <span className="material-symbols-outlined text-secondary text-base">
                      check_circle
                    </span>
                    Prepare recent lab results
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {/* Educational Nudge */}
          <div className="bg-surface-container-low rounded-xl p-5 border border-outline-variant/10">
            <div className="flex items-start gap-3">
              <span className="material-symbols-outlined text-primary mt-0.5">
                info
              </span>
              <div>
                <h4 className="text-sm font-bold text-primary mb-1">
                  Why Family Medicine?
                </h4>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  A Family Medicine practitioner can provide a comprehensive
                  initial evaluation and coordinate specialized care if
                  necessary.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Provider Cards */}
        <div className="lg:col-span-8 flex flex-col gap-6">
          {/* ZIP Code Input */}
          <div className="bg-surface-container-low rounded-xl p-4 border border-outline-variant/10">
            <label className="block text-sm font-semibold text-on-surface mb-2">
              Search providers by ZIP code
            </label>
            <div className="flex gap-2">
              <input
                className="flex-1 bg-surface border border-outline-variant/30 text-on-surface text-sm rounded-lg px-3 py-2 font-body focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary placeholder:text-on-surface-variant/50"
                placeholder="Enter ZIP code (e.g., 94107)"
                type="text"
                value={zipCode}
                onChange={(e) => setZipCode(e.target.value)}
                maxLength="5"
              />
              <button className="px-4 py-2 rounded-lg gradient-primary text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity">
                Search
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-headline font-bold text-primary">
              Recommended Providers
            </h2>
            <button className="text-sm font-semibold text-primary hover:text-primary-container transition-colors flex items-center gap-1">
              Filter Matches{" "}
              <span className="material-symbols-outlined text-sm">tune</span>
            </button>
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin mb-4">
                  <span className="material-symbols-outlined text-primary text-4xl">refresh</span>
                </div>
                <p className="text-on-surface-variant font-body">Searching for providers...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !isLoading && (
            <div className="bg-error/10 border border-error rounded-xl p-4">
              <div className="flex items-start gap-3">
                <span className="material-symbols-outlined text-error mt-0.5">error</span>
                <div>
                  <h3 className="text-sm font-semibold text-error mb-1">Search Error</h3>
                  <p className="text-sm text-on-surface-variant">
                    Failed to load providers. Please check your ZIP code and try again.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Provider Cards */}
          <div className="space-y-4">
            {!isLoading && !error && liveProviders.length === 0 && (
              <div className="text-center py-12">
                <span className="material-symbols-outlined text-outline text-4xl mb-4 block">location_off</span>
                <p className="text-on-surface-variant font-body">No providers found in this area. Try a different ZIP code.</p>
              </div>
            )}
            {liveProviders.map((provider, idx) => (
              <article
                key={idx}
                className="bg-surface-container-lowest rounded-xl p-5 md:p-6 shadow-ambient border-ghost hover:-translate-y-1 transition-transform duration-300 group flex flex-col sm:flex-row gap-6"
              >
                {/* Provider Image - Show placeholder if no image available */}
                <div className="flex flex-col items-center gap-3 shrink-0">
                  <div className="relative">
                    <div className="w-24 h-24 md:w-28 md:h-28 rounded-full bg-surface-container flex items-center justify-center border-4 border-surface">
                      <span className="material-symbols-outlined text-on-surface-variant text-3xl">person</span>
                    </div>
                    <div className="absolute -bottom-2 right-0 bg-surface-container-lowest rounded-full p-1 border-ghost shadow-sm">
                      <span
                        className="material-symbols-outlined text-secondary text-lg"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        verified
                      </span>
                    </div>
                  </div>
                  {/* Insurance Badge */}
                  <div className="bg-surface-container-high text-on-surface-variant text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider text-center w-full">
                    {provider.phone ? 'Verified' : 'Unverified'}
                  </div>
                </div>
                {/* Provider Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <h3 className="text-lg md:text-xl font-headline font-bold text-on-surface">
                        {provider.name}
                      </h3>
                      {provider.distance_approx && (
                        <div className="flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-2 py-1 rounded-md">
                          <span className="material-symbols-outlined text-base">
                            location_on
                          </span>
                          {provider.distance_approx}
                        </div>
                      )}
                    </div>
                    <p className="text-primary font-medium text-sm mb-3">
                      {provider.specialty}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4 md:mb-0">
                      {provider.npi && (
                        <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded">
                          <span className="material-symbols-outlined text-[14px]">
                            badge
                          </span>
                          NPI: {provider.npi}
                        </span>
                      )}
                      {provider.phone && (
                        <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded\">
                          <span className="material-symbols-outlined text-[14px]">
                            phone
                          </span>
                          {provider.phone}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-auto pt-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-end">
                    <button className="px-4 py-2 rounded-lg text-primary font-semibold text-sm hover:bg-surface-container transition-colors border border-outline-variant/30 text-center">
                      View Profile
                    </button>
                    <button
                      className="px-6 py-2 rounded-lg gradient-primary text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity shadow-sm text-center disabled:opacity-50 disabled:cursor-not-allowed"
                      disabled={bookAppointmentMutation.isPending}
                      onClick={() => handleBookAppointment(provider.name)}
                    >
                      {bookingProvider === provider.name && bookAppointmentMutation.isPending
                        ? "Booking..."

                        : "Book Appointment"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          {/* Insurance Disclaimer */}
          <div className="bg-surface-container-low rounded-lg p-4 border border-outline-variant/10 flex items-start gap-3">
            <span className="material-symbols-outlined text-outline text-lg mt-0.5">
              info
            </span>
            <p className="text-xs text-on-surface-variant leading-relaxed">
              <strong className="text-on-surface">
                Insurance verification unavailable.
              </strong>{" "}
              Please contact providers directly to confirm they accept your
              insurance plan before booking.
            </p>
          </div>

          <div className="mt-4 text-center">
            <button className="text-primary font-semibold text-sm hover:text-primary-container transition-colors py-2 px-4 rounded-lg hover:bg-surface-container-low">
              Show More Matches
            </button>
          </div>
        </div>
      </div>

      {/* Booking Confirmation Modal */}
      {showConfirmation && bookingDetails && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-surface rounded-2xl max-w-md w-full shadow-2xl border border-outline-variant/20">
            <div className="p-6">
              <div className="flex items-center justify-center mb-4">
                <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-3xl">
                    check_circle
                  </span>
                </div>
              </div>

              <h2 className="text-xl font-headline font-bold text-primary text-center mb-2">
                Appointment Booked!
              </h2>

              <p className="text-on-surface-variant text-center text-sm mb-6">
                Your appointment has been successfully scheduled
              </p>

              <div className="bg-surface-container-low rounded-xl p-4 mb-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <span className="text-sm font-medium text-on-surface">Provider</span>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-on-surface">
                        {bookingDetails.providerName}
                      </div>
                      <div className="text-xs text-on-surface-variant">
                        {bookingDetails.specialty}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-on-surface">Next Available</span>
                    <span className="text-sm text-on-surface">
                      {bookingDetails.nextAvail}
                    </span>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-on-surface">Confirmation #</span>
                    <span className="text-sm font-mono font-semibold text-primary">
                      {bookingDetails.confirmationNumber}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  className="flex-1 px-4 py-3 rounded-lg border border-outline-variant/30 text-on-surface font-semibold text-sm hover:bg-surface-container transition-colors"
                  onClick={() => setShowConfirmation(false)}
                >
                  Close
                </button>
                <button
                  className="flex-1 px-4 py-3 rounded-lg gradient-primary text-on-primary font-semibold text-sm hover:opacity-90 transition-opacity"
                  onClick={() => setShowConfirmation(false)}
                >
                  View Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CareMatchesPage;
