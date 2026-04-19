import type { ActiveMedication } from "./types";
import { getMedicationTitleLines } from "./medicationNames";

type MedicationNameHeadingProps = {
  med: Pick<ActiveMedication, "name" | "commonName" | "scientificName">;
  /** Larger primary on detail page */
  size?: "list" | "detail";
};

/**
 * Renders common name large and scientific name small when both exist; otherwise one line only.
 */
export function MedicationNameHeading({ med, size = "list" }: MedicationNameHeadingProps) {
  const { primary, secondary } = getMedicationTitleLines(
    med.commonName,
    med.scientificName,
    med.name,
  );
  const primaryClass =
    size === "detail"
      ? "text-2xl md:text-3xl font-headline font-extrabold text-primary tracking-tight"
      : "text-lg font-headline font-bold text-on-surface";

  return (
    <div className="min-w-0">
      <p className={`${primaryClass} truncate`}>{primary}</p>
      {secondary ? (
        <p className="text-sm text-on-surface-variant font-body mt-0.5 truncate">{secondary}</p>
      ) : null}
    </div>
  );
}
