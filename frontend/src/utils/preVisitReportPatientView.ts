/**
 * Turns backend `pre_visit_report` JSON (survey and/or chat handoff) into short,
 * patient-readable sections. Handles both LLM clinical shape and minimal survey shape.
 */

export type PatientReportSection = {
  heading: string;
  body?: string;
  bullets?: string[];
};

export type PatientFriendlyPreVisit = {
  triageLevel: string | null;
  triagePatientNote: string | null;
  sections: PatientReportSection[];
};

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t ? t : null;
}

function strList(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "string" ? x.trim() : ""))
    .filter(Boolean);
}

function triagePatientNote(level: string | null): string | null {
  if (!level) {
    return "Urgency was not finalized for this check. Ask your clinician how soon you should be seen.";
  }
  switch (level) {
    case "emergency":
      return "This check suggested emergency-level concern. If you might be having a medical emergency, call your local emergency number right away.";
    case "urgent":
      return "This check suggested you may need care soon (often within hours to a day), depending on how you feel and your clinician’s advice.";
    case "routine":
      return "This check suggested routine timing may be reasonable; still seek care sooner if symptoms worsen or worry you.";
    default:
      return null;
  }
}

function severityPatientLine(sev: string | null): string | null {
  if (!sev) return null;
  const s = sev.toLowerCase();
  if (s.includes("mild"))
    return "You indicated your symptoms felt relatively mild overall.";
  if (s.includes("moderate"))
    return "You indicated your symptoms felt moderate overall.";
  if (s.includes("severe"))
    return "You indicated your symptoms felt severe overall — tell your clinician if that is still true.";
  return `Overall, you described severity as: ${sev}.`;
}

/**
 * Build readable sections from `pre_visit_report`. Returns null if there is nothing to show.
 */
export function buildPatientFriendlyPreVisit(
  report: Record<string, unknown> | null | undefined,
): PatientFriendlyPreVisit | null {
  if (!report || typeof report !== "object") return null;

  const triageLevel = str(report.triage_level);
  const sections: PatientReportSection[] = [];

  const chief = str(report.chief_complaint);
  const summary = str(report.patient_summary);
  if (chief) {
    sections.push({ heading: "Main concern", body: chief });
  } else if (summary) {
    sections.push({ heading: "Summary for your visit", body: summary });
  }

  const hpi = str(report.hpi);
  if (hpi) {
    sections.push({
      heading: "What you shared (your story)",
      body: hpi,
    });
  }

  const described = str(report.patient_description);
  if (described) {
    sections.push({
      heading: "In plain language",
      body: described,
    });
  }

  const symptoms = strList(report.reported_symptoms);
  if (symptoms.length) {
    sections.push({
      heading: "Symptoms you mentioned",
      bullets: symptoms,
    });
  }

  const sevLine = severityPatientLine(str(report.overall_patient_severity));
  if (sevLine) {
    sections.push({ heading: "How strong your symptoms felt", body: sevLine });
  }

  const risks = strList(report.risk_factors);
  if (risks.length) {
    sections.push({
      heading: "Things to mention to your clinician",
      body: "These factors may be important for your visit:",
      bullets: risks,
    });
  }

  const meds = strList(report.medications);
  if (meds.length) {
    sections.push({
      heading: "Medicines to mention",
      bullets: meds,
    });
  }

  if (!sections.length) {
    const fallback: string[] = [];
    for (const [key, val] of Object.entries(report)) {
      if (key === "triage_level") continue;
      if (typeof val === "string" && val.trim()) {
        fallback.push(`${humanizeKey(key)}: ${val.trim()}`);
      }
    }
    if (fallback.length) {
      sections.push({
        heading: "Visit notes",
        bullets: fallback,
      });
    }
  }

  if (!sections.length) return null;

  return {
    triageLevel,
    triagePatientNote: triagePatientNote(triageLevel),
    sections,
  };
}

function humanizeKey(k: string): string {
  return k
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
