import React from "react";

/**
 * Static hotline UI using tel:/sms: links. Do not add integration or E2E tests
 * that follow these URLs or simulate taps on them — that can place real calls
 * or texts from CI or developer devices.
 */

type Hotline = {
  name: string;
  description: string;
  phoneDisplay: string;
  /** tel: or sms: URI */
  href: string;
  icon: string;
  /** Primary button shows call vs. text affordance */
  kind?: "call" | "sms";
};

const hotlines: Hotline[] = [
  {
    name: "988 Suicide & Crisis Lifeline",
    description:
      "Free, confidential support for people in distress, prevention and crisis resources. Press 1 for the Veterans Crisis Line.",
    phoneDisplay: "988",
    href: "tel:988",
    icon: "support_agent",
  },
  {
    name: "Crisis Text Line",
    description:
      "Text with a trained crisis counselor. Available 24/7 in the United States.",
    phoneDisplay: "Text HOME to 741741",
    href: "sms:741741&body=HOME",
    icon: "chat",
    kind: "sms",
  },
  {
    name: "Poison Help",
    description:
      "American Association of Poison Control Centers. Expert help for poisonings, medication mistakes, and chemical exposures.",
    phoneDisplay: "1-800-222-1222",
    href: "tel:+18002221222",
    icon: "science",
  },
  {
    name: "National Domestic Violence Hotline",
    description:
      "Confidential support, safety planning, and resources. Available 24/7.",
    phoneDisplay: "1-800-799-7233",
    href: "tel:+18007997233",
    icon: "shield_person",
  },
  {
    name: "RAINN National Sexual Assault Hotline",
    description:
      "Confidential support from trained staff. Available 24/7.",
    phoneDisplay: "1-800-656-HOPE (4673)",
    href: "tel:+18006564673",
    icon: "gavel",
  },
  {
    name: "SAMHSA National Helpline",
    description:
      "Treatment referral and information for mental and substance use disorders. English and Spanish.",
    phoneDisplay: "1-800-662-4357",
    href: "tel:+18006624357",
    icon: "psychology",
  },
];

const EmergencyContactPage: React.FC = () => {
  return (
    <div className="flex-1 overflow-y-auto p-4 md:p-10 lg:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        <header className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-error-container/60 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-on-error-container">
            <span
              className="material-symbols-outlined text-base"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              emergency
            </span>
            Emergency resources
          </div>
          <h1 className="font-headline text-3xl md:text-5xl font-extrabold text-primary tracking-tight">
            Emergency contacts
          </h1>
          <p className="font-body text-on-surface-variant text-base max-w-2xl">
            Use these numbers when you or someone nearby needs immediate help
            or trained crisis support. HealthOS does not provide emergency
            services and is not a substitute for calling 911 or a crisis line.
          </p>
        </header>

        <div
          className="rounded-xl border border-error-container/40 bg-error-container/25 p-5 md:p-6"
          role="region"
          aria-label="Life-threatening emergency"
        >
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-error text-on-error">
                <span
                  className="material-symbols-outlined text-3xl"
                  style={{ fontVariationSettings: "'FILL' 1" }}
                >
                  local_hospital
                </span>
              </div>
              <div>
                <h2 className="font-headline text-lg font-bold text-on-surface">
                  Life-threatening emergency
                </h2>
                <p className="mt-1 text-sm text-on-surface-variant">
                  If you believe someone is in immediate danger, call emergency
                  services now.
                </p>
              </div>
            </div>
            <a
              href="tel:911"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-error px-6 py-3.5 font-headline text-lg font-bold text-on-error shadow-md transition hover:opacity-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-error"
            >
              <span className="material-symbols-outlined">call</span>
              Call 911
            </a>
          </div>
          <p className="mt-4 text-xs text-on-surface-variant border-t border-outline-variant/30 pt-4">
            Outside the United States, dial your country&apos;s emergency
            number (for example, 112 in much of Europe).
          </p>
        </div>

        <section aria-labelledby="hotlines-heading">
          <h2
            id="hotlines-heading"
            className="font-headline text-xl font-bold text-primary mb-4"
          >
            Other helplines (United States)
          </h2>
          <ul className="flex flex-col gap-4">
            {hotlines.map((line) => {
              const isSms = line.kind === "sms";
              return (
                <li key={line.name}>
                  <article className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest p-5 shadow-ambient">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex gap-3">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-fixed/20 text-primary">
                          <span className="material-symbols-outlined text-xl">
                            {line.icon}
                          </span>
                        </div>
                        <div>
                          <h3 className="font-headline font-bold text-on-surface">
                            {line.name}
                          </h3>
                          <p className="mt-1 text-sm text-on-surface-variant max-w-xl">
                            {line.description}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
                        <a
                          href={line.href}
                          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 font-headline text-sm font-bold text-on-primary shadow-sm transition hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                        >
                          <span className="material-symbols-outlined text-lg">
                            {isSms ? "sms" : "call"}
                          </span>
                          {line.phoneDisplay}
                        </a>
                      </div>
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </section>

        <p className="text-xs text-on-surface-variant pb-8">
          Numbers and services may change. Verify critical contacts with official
          sources. If you cannot speak safely on the phone, many regions support
          text-to-911; availability varies by location.
        </p>
      </div>
    </div>
  );
};

export default EmergencyContactPage;
