import { jsPDF } from "jspdf";
import type { PatientFriendlyPreVisit } from "./preVisitReportPatientView";

const MARGIN = 18;
const PAGE_BOTTOM_PAD = 16;

const FONT_FAMILY = "Manrope";

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function embedManropeFonts(doc: jsPDF): Promise<boolean> {
  const base = import.meta.env.BASE_URL || "/";
  const pathPrefix = base.endsWith("/") ? `${base}fonts/` : `${base}/fonts/`;
  const makeUrl = (file: string) =>
    typeof window !== "undefined"
      ? new URL(`${pathPrefix}${file}`, window.location.origin).href
      : `${pathPrefix}${file}`;

  try {
    const [boldRes, regRes] = await Promise.all([
      fetch(makeUrl("Manrope-Bold.ttf")),
      fetch(makeUrl("Manrope-Regular.ttf")),
    ]);
    if (!boldRes.ok || !regRes.ok) return false;

    const boldB64 = arrayBufferToBase64(await boldRes.arrayBuffer());
    const regB64 = arrayBufferToBase64(await regRes.arrayBuffer());

    doc.addFileToVFS("Manrope-Bold.ttf", boldB64);
    doc.addFont("Manrope-Bold.ttf", FONT_FAMILY, "bold", "normal", "Identity-H");
    doc.addFileToVFS("Manrope-Regular.ttf", regB64);
    doc.addFont("Manrope-Regular.ttf", FONT_FAMILY, "normal", "normal", "Identity-H");
    return true;
  } catch {
    return false;
  }
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

function setBodyFont(doc: jsPDF, hasManrope: boolean): void {
  if (hasManrope) {
    doc.setFont(FONT_FAMILY, "normal");
  } else {
    doc.setFont("helvetica", "normal");
  }
}

function setBoldFont(doc: jsPDF, hasManrope: boolean): void {
  if (hasManrope) {
    doc.setFont(FONT_FAMILY, "bold");
  } else {
    doc.setFont("helvetica", "bold");
  }
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

  const hasManrope = await embedManropeFonts(doc);

  const base = import.meta.env.BASE_URL || "/";
  const logoPath = base.endsWith("/") ? `${base}logo.png` : `${base}/logo.png`;
  const logoUrl =
    typeof window !== "undefined" ? new URL(logoPath, window.location.origin).href : logoPath;

  const drawBrandTopRight = (brandRight: number) => {
    const subSize = 7.5;
    setBodyFont(doc, hasManrope);
    doc.setFontSize(subSize);
    const clinicalW = doc.getTextWidth("Clinical Sanctuary");

    setBoldFont(doc, hasManrope);
    let titleSize = 10;
    let bestDiff = Infinity;
    for (let s = 8; s <= 26; s += 0.25) {
      doc.setFontSize(s);
      const w = doc.getTextWidth("HealthOS");
      const diff = Math.abs(w - clinicalW);
      if (diff < bestDiff) {
        bestDiff = diff;
        titleSize = s;
      }
    }
    doc.setFontSize(titleSize);

    const yTop = MARGIN + 4;
    doc.setTextColor(0);
    doc.text("HealthOS", brandRight, yTop, { align: "right" });

    const ySub = yTop + Math.max(5.5, titleSize * 0.38);
    setBodyFont(doc, hasManrope);
    doc.setFontSize(subSize);
    doc.setTextColor(55);
    doc.text("Clinical Sanctuary", brandRight, ySub, { align: "right" });
    doc.setTextColor(0);
  };

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
      const logoLeft = pw - MARGIN - w;
      doc.addImage(dataUrl, "PNG", logoLeft, MARGIN, w, h);
      drawBrandTopRight(logoLeft - 4);
    } else {
      drawBrandTopRight(pw - MARGIN);
    }
  } catch {
    drawBrandTopRight(pw - MARGIN);
  }

  let y = MARGIN + 16;
  setBoldFont(doc, hasManrope);
  doc.setFontSize(17);
  doc.text("HealthOS", MARGIN, y);
  y += 7;
  doc.setFontSize(13);
  setBodyFont(doc, hasManrope);
  doc.text("Pre-visit summary", MARGIN, y);
  y += 10;

  doc.setFontSize(9);
  doc.setTextColor(90);
  y = addWrapped(doc, y, `Generated: ${formatPdfDate(opts.createdAtIso)}`, textW, lineH, MARGIN);
  doc.setTextColor(0);
  y += 3;

  doc.setFontSize(10);
  setBodyFont(doc, hasManrope);
  const triage = opts.triageLevel ? capitalize(opts.triageLevel) : "Not set";
  y = addWrapped(doc, y, `Suggested urgency: ${triage}`, textW, lineH, MARGIN);
  y += 4;

  if (opts.patientView?.triagePatientNote) {
    doc.setFont("helvetica", "italic");
    doc.setTextColor(55);
    y = addWrapped(doc, y, opts.patientView.triagePatientNote, textW, lineH, MARGIN);
    setBodyFont(doc, hasManrope);
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
      setBoldFont(doc, hasManrope);
      doc.setFontSize(11);
      doc.text(sec.heading, MARGIN, y);
      y += 6;
      setBodyFont(doc, hasManrope);
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
  setBodyFont(doc, hasManrope);
  const disclaimer =
    "For your records only. This document does not replace professional medical advice, diagnosis, or treatment. Discuss with a qualified clinician.";
  y = addWrapped(doc, y, disclaimer, textW, 4.2, MARGIN);

  const safeId = opts.sessionId.replace(/[^a-zA-Z0-9-]/g, "").slice(0, 12);
  doc.save(`healthos-previsit-${safeId}.pdf`);
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
