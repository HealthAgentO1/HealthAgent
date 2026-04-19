import type { SymptomSessionListItem } from "../api/queries";

function pickString(r: Record<string, unknown>, key: string): string | null {
  const v = r[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** Target length for one line in the past-checks list (characters). */
const MAX_LABEL_LEN = 52;

function shortenWords(text: string, maxWords: number): string {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length <= maxWords) {
    let s = words.join(" ");
    if (s.length > MAX_LABEL_LEN) {
      s = `${s.slice(0, MAX_LABEL_LEN - 1).trim()}…`;
    }
    return s;
  }
  let joined = words.slice(0, maxWords).join(" ");
  if (joined.length > MAX_LABEL_LEN - 1) {
    joined = `${joined.slice(0, MAX_LABEL_LEN - 1).trim()}…`;
  } else {
    joined = `${joined}…`;
  }
  return joined;
}

/** Prefer first sentence; otherwise first chunk of words (patient-stated content). */
function shortenFromPatientText(text: string): string {
  const t = text.trim();
  if (!t) return "";

  const sentenceMatch = t.match(/^[^.!?]+[.!?]?/);
  let first = (sentenceMatch ? sentenceMatch[0] : t).trim();
  if (first.length > 140) {
    first = first.slice(0, 140).trim();
  }
  if (first.length <= MAX_LABEL_LEN && first.length > 0) return first;

  return shortenWords(first, 8);
}

/**
 * Short label for past-checks list: prioritize what the patient actually described
 * (chief complaint, reported symptoms, survey summary, HPI), then API summary.
 */
export function patientCheckListLabel(s: SymptomSessionListItem): string {
  const raw = s.pre_visit_report;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const report = raw as Record<string, unknown>;

    const chief = pickString(report, "chief_complaint");
    if (chief) return shortenFromPatientText(chief);

    const symptoms = report["reported_symptoms"];
    if (Array.isArray(symptoms)) {
      const firstSym = symptoms.find((x) => typeof x === "string" && x.trim());
      if (typeof firstSym === "string") return shortenFromPatientText(firstSym);
    }

    const patientSummary = pickString(report, "patient_summary");
    if (patientSummary) return shortenFromPatientText(patientSummary);

    const hpi = pickString(report, "hpi");
    if (hpi) return shortenFromPatientText(hpi);

    const described = pickString(report, "patient_description");
    if (described) return shortenFromPatientText(described);
  }

  const fallback = (s.summary || "").trim();
  if (fallback) return shortenFromPatientText(fallback) || shortenWords(fallback, 6);

  return "Symptom check";
}

/** @deprecated Use {@link patientCheckListLabel} — kept for any stray imports. */
export function shortSessionTitle(s: SymptomSessionListItem): string {
  return patientCheckListLabel(s);
}
