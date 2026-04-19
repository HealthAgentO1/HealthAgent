/**
 * Brand marks served from `public/insurance-logos/` (Wikimedia Commons / English Wikipedia
 * via `Special:FilePath`, PD / fair-use per each file page). Trademarks remain with their owners.
 */
export type InsuranceLogoId =
  | "centene"
  | "cigna"
  | "healthnet"
  | "fidelis"
  | "unitedhealthcare"
  | "elevance"
  | "humana"
  | "other";

type LogoProps = {
  className?: string;
};

const BASE = import.meta.env.BASE_URL;

function assetUrl(file: string): string {
  return `${BASE}${file.replace(/^\//, "")}`;
}

const LOGO_SRC: Record<Exclude<InsuranceLogoId, "other">, string> = {
  centene: assetUrl("insurance-logos/centene.svg"),
  cigna: assetUrl("insurance-logos/cigna.png"),
  healthnet: assetUrl("insurance-logos/healthnet.png"),
  fidelis: assetUrl("insurance-logos/fidelis.jpg"),
  unitedhealthcare: assetUrl("insurance-logos/unitedhealthcare.svg"),
  elevance: assetUrl("insurance-logos/elevance.svg"),
  humana: assetUrl("insurance-logos/humana.svg"),
};

/** Slight per-file scale so wide wordmarks fit and padded PNGs read closer to peers. */
const LOGO_IMG_SCALE: Partial<Record<Exclude<InsuranceLogoId, "other">, string>> = {
  centene: "scale-[0.94]",
  cigna: "scale-[1.42]",
  fidelis: "scale-[1.28]",
  humana: "scale-[0.9]",
  elevance: "scale-[0.88]",
  unitedhealthcare: "scale-[0.96]",
  healthnet: "scale-[1.04]",
};

/** Fixed “viewport” so every card aligns; overflow clips scaled raster marks. */
const FRAME =
  "relative flex h-10 w-[5rem] shrink-0 items-center justify-center overflow-hidden rounded-sm sm:h-10 sm:w-[5.25rem]";

function OtherMark() {
  return (
    <svg
      aria-hidden
      className="h-8 w-8 max-h-[2.15rem] max-w-[2.15rem] object-contain"
      fill="none"
      role="presentation"
      viewBox="0 0 40 40"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect fill="#E8E8E8" height="36" rx="8" width="36" x="2" y="2" />
      <path
        d="M14 16h12v14H14V16Zm6-4v4M12 18h16"
        stroke="#5F6368"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
      <circle cx="26" cy="24" fill="#5F6368" r="1.6" />
    </svg>
  );
}

export function InsuranceCompanyLogo({ id, className }: { id: InsuranceLogoId } & LogoProps) {
  const frameClass = className ?? FRAME;

  if (id === "other") {
    return (
      <span className={frameClass}>
        <OtherMark />
      </span>
    );
  }

  const src = LOGO_SRC[id];
  const scaleClass = LOGO_IMG_SCALE[id] ?? "";

  return (
    <span className={frameClass}>
      <img
        alt=""
        className={`max-h-[2.35rem] max-w-[4.65rem] object-contain object-center ${scaleClass}`.trim()}
        decoding="async"
        loading="lazy"
        src={src}
      />
    </span>
  );
}
