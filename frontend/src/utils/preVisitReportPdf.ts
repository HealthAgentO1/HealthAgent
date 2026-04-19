import { jsPDF } from "jspdf";
import type { PatientFriendlyPreVisit } from "./preVisitReportPatientView";

const MARGIN = 18;
const PAGE_BOTTOM_PAD = 16;

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatPdfDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function pageHeight(doc: jsPDF): number {
  return doc.internal.pageSize.getHeight();
}

function pageWidth(doc: jsPDF): number {
  return doc.internal.pageSize.getWidth();
}

function ensureY(doc: jsPDF, y: number, lineHeight: number): number {
  const h = pageHeight(doc);
  if (y + lineHeight > h - PAGE_BOTTOM_PAD) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

function addWrapped(
  doc: jsPDF,
  y: number,
  text: string,
  maxWidth: number,
  lineHeight: number,
  x: number,
): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  let cy = y;
  for (const line of lines) {
    cy = ensureY(doc, cy, lineHeight);
    doc.text(line, x, cy);
    cy += lineHeight;
  }
  return cy;
}

export async function downloadPreVisitReportPdf(opts: {
  createdAtIso: string;
  sessionId: string;
  triageLevel: string | null;
  summaryLine: string;
  patientView: PatientFriendlyPreVisit | null;
}): Promise<void> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pw = pageWidth(doc);
  const textW = pw - 2 * MARGIN;
  const lineH = 5;

  const base = import.meta.env.BASE_URL || "/";
  const logoPath = base.endsWith("/") ? `${base}logo.png` : `${base}/logo.png`;
  const logoUrl =
    typeof window !== "undefined" ? new URL(logoPath, window.location.origin).href : logoPath;
  try {
    const res = await fetch(logoUrl);
    if (res.ok) {
      const dataUrl = await blobToDataUrl(await res.blob());
      const imgH = 13;
      const props = doc.getImageProperties(dataUrl);
      const imgW = (props.width / props.height) * imgH;
      const maxW = 42;
      const w = imgW > maxW ? maxW : imgW;
      const h = imgW > maxW ? (props.height / props.width) * w : imgH;
      doc.addImage(dataUrl, "PNG", pw - MARGIN - w, MARGIN, w, h);
    }
  } catch {
    /* optional branding */
  }

  let y = MARGIN + 16;
  doc.setTextColor(0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.text("Health Guardian", MARGIN, y);
  y += 7;
  doc.setFontSize(13);
  doc.text("Pre-visit summary", MARGIN, y);
  y += 10;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  y = addWrapped(doc, y, `Generated: ${formatPdfDate(opts.createdAtIso)}`, textW, lineH, MARGIN);
  doc.setTextColor(0);
  y += 3;

  doc.setFontSize(10);
  const triage = opts.triageLevel ? capitalize(opts.triageLevel) : "Not set";
  y = addWrapped(doc, y, `Suggested urgency: ${triage}`, textW, lineH, MARGIN);
  y += 4;

  if (opts.patientView?.triagePatientNote) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(55);
    y = addWrapped(doc, y, opts.patientView.triagePatientNote, textW, lineH, MARGIN);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0);
    y += 4;
  }

  if (!opts.patientView) {
    const fallback =
      opts.summaryLine.trim() ||
      "No detailed pre-visit summary was generated for this session. You can still share the date and urgency above with your clinician.";
    y = addWrapped(doc, y, fallback, textW, lineH, MARGIN);
    y += 6;
  } else {
    for (const sec of opts.patientView.sections) {
      y = ensureY(doc, y, lineH + 2);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(sec.heading, MARGIN, y);
      y += 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      if (sec.body) {
        y = addWrapped(doc, y, sec.body, textW, lineH, MARGIN);
      }
      if (sec.bullets?.length) {
        for (const b of sec.bullets) {
          y = addWrapped(doc, y, `• ${b}`, textW - 4, lineH, MARGIN + 4);
        }
      }
      y += 4;
    }
  }

  y = ensureY(doc, y, lineH + 4);
  doc.setFontSize(8);
  doc.setTextColor(110);
  const disclaimer =
    "For your records only. This document does not replace professional medical advice, diagnosis, or treatment. Discuss with a qualified clinician.";
  y = addWrapped(doc, y, disclaimer, textW, 4.2, MARGIN);

  const safeId = opts.sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
  doc.save(`health-guardian-previsit-${safeId}.pdf`);
}
