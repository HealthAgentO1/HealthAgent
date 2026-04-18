import React, { useState } from "react";
import { useBookAppointment } from "../api/queries";

const providers = [
  {
    name: "Dr. Sarah Jenkins, MD",
    specialty: "Family Medicine • Board Certified",
    distance: "2.4 miles",
    nextAvail: "Tomorrow",
    rating: "4.9",
    reviews: 120,
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuAvG6QodwNCAd7kB5FKexwqkLu81bWs9kH9Qot9I0JP2G14fKlKx4sJOfaJY9mYkkGi878HtdnfoawgLkLLsmXaT6uXXZdC76JskONit34hkT7u5qcuXiWSxWCvEvVGuvuEbPWHoBHugmA1U4Qrrzoke4FMy0UxHzYj0GyU3uFlrudNWpKgGo_QNV36TaUxk7dJZtNlgqBnfyDNCHIhVJyk6YZV0beMF0Bb1EoO51_P9_su8ytyPShcNT6PNZtK-xuXZWZhx_FJzDs",
  },
  {
    name: "Dr. Michael Chen, DO",
    specialty: "Internal Medicine • Geriatrics Focus",
    distance: "3.8 miles",
    nextAvail: "Thursday",
    rating: "4.8",
    reviews: 85,
    image:
      "https://lh3.googleusercontent.com/aida-public/AB6AXuDh9kWCN_4bRBsWRcknH-zrcLcDYWBBYnAGErNfY_h0cxPchuuzEvUrOYWL-lX7UT1WrwAMZjdbc5HGg8esuX0oxQJlubt4HaIChKS44ZBwG2poIZOXEnWrh0eiBfqsQmMBeZ6Z-JTxV3gTu3oOyBxdjaSmvBKWnhf-OdZpiqdSa4pkf4oJHRyjvOX5maGcYQo5F66Z0TDbWYl7yCpnxBbpU5G4n_8HJZmAcBtGW_JyRrE6OS8NjD91nrhjMW3YjnHxEsZnmomUtv8",
  },
];

const CareMatchesPage: React.FC = () => {
  const [bookingProvider, setBookingProvider] = useState<string | null>(null);
  const [confirmationNumber, setConfirmationNumber] = useState<string | null>(null);
  const bookAppointmentMutation = useBookAppointment();

  // Mock session ID - in real app this would come from routing or context
  const sessionId = 1; // TODO: Get from actual session

  const handleBookAppointment = (providerName: string) => {
    setBookingProvider(providerName);
    bookAppointmentMutation.mutate(sessionId, {
      onSuccess: (data) => {
        setConfirmationNumber(data.confirmation_number);
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
      {/* Header */}
      <header className="mb-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-secondary-fixed text-on-secondary-fixed text-xs font-semibold uppercase tracking-wider mb-4 border border-secondary-fixed-dim/30">
            <span className="material-symbols-outlined text-sm">
              calendar_clock
            </span>
            Routine Care Recommended
          </div>
          <h1 className="text-4xl md:text-5xl font-headline font-bold text-primary tracking-tight mb-2">
            Care Recommendations
          </h1>
          <p className="text-on-surface-variant font-body text-base max-w-2xl">
            Based on your recent symptom check, we have identified specialized
            providers to assist with your ongoing wellness journey.
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
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-2xl font-headline font-bold text-primary">
              Recommended Providers
            </h2>
            <button className="text-sm font-semibold text-primary hover:text-primary-container transition-colors flex items-center gap-1">
              Filter Matches{" "}
              <span className="material-symbols-outlined text-sm">tune</span>
            </button>
          </div>
          <div className="space-y-4">
            {providers.map((provider, idx) => (
              <article
                key={idx}
                className="bg-surface-container-lowest rounded-xl p-5 md:p-6 shadow-ambient border-ghost hover:-translate-y-1 transition-transform duration-300 group flex flex-col sm:flex-row gap-6"
              >
                {/* Provider Image */}
                <div className="flex flex-col items-center gap-3 shrink-0">
                  <div className="relative">
                    <img
                      alt={provider.name}
                      className="w-24 h-24 md:w-28 md:h-28 rounded-full object-cover border-4 border-surface"
                      src={provider.image}
                    />
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
                    Verify Insurance
                  </div>
                </div>
                {/* Provider Details */}
                <div className="flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-1">
                      <h3 className="text-lg md:text-xl font-headline font-bold text-on-surface">
                        {provider.name}
                      </h3>
                      <div className="flex items-center gap-1 text-sm font-medium text-on-surface-variant bg-surface-container-low px-2 py-1 rounded-md">
                        <span className="material-symbols-outlined text-base">
                          location_on
                        </span>
                        {provider.distance}
                      </div>
                    </div>
                    <p className="text-primary font-medium text-sm mb-3">
                      {provider.specialty}
                    </p>
                    <div className="flex flex-wrap gap-2 mb-4 md:mb-0">
                      <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded">
                        <span className="material-symbols-outlined text-[14px]">
                          calendar_month
                        </span>
                        Next avail: {provider.nextAvail}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs text-on-surface-variant bg-surface-container px-2 py-1 rounded">
                        <span className="material-symbols-outlined text-[14px]">
                          star
                        </span>
                        {provider.rating} ({provider.reviews} reviews)
                      </span>
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
                        : confirmationNumber
                        ? `Booked - ${confirmationNumber}`
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
    </div>
  );
};

export default CareMatchesPage;
