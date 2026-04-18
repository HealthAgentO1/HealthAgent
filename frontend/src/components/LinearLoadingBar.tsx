import { useEffect, useState } from "react";

/**
 * While `active`, advances toward ~92% on a timer (no real byte progress from the API).
 * When `active` ends, snaps to 100% briefly then resets for the next run.
 */
export function useSimulatedProgress(active: boolean): number {
  const [pct, setPct] = useState(0);

  useEffect(() => {
    if (!active) {
      setPct((p) => (p <= 0 ? 0 : 100));
      const done = window.setTimeout(() => setPct(0), 380);
      return () => clearTimeout(done);
    }

    setPct(6);
    const id = window.setInterval(() => {
      setPct((p) => {
        if (p >= 91) return p + Math.random() * 0.4;
        return Math.min(91, p + 4 + Math.random() * 9);
      });
    }, 260);
    return () => clearInterval(id);
  }, [active]);

  return Math.min(100, pct);
}

type LinearLoadingBarProps = {
  /** 0–100 fill width */
  progress: number;
  /** Accessible name */
  label: string;
  /** Shown as “up to N seconds” under the bar (e.g. 30). */
  estimatedSeconds?: number;
  className?: string;
};

/**
 * Determinate-style bar driven by `useSimulatedProgress` while a request runs.
 */
export function LinearLoadingBar({
  progress,
  label,
  estimatedSeconds,
  className = "",
}: LinearLoadingBarProps) {
  const estimateText =
    estimatedSeconds != null
      ? `Estimated: up to ${estimatedSeconds} seconds`
      : null;
  const ariaValueText =
    estimateText != null ? `${label}. ${estimateText}` : label;

  return (
    <div className={className}>
      <div
        className="h-2.5 w-full rounded-full bg-surface-container-high overflow-hidden border border-outline-variant/20"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        aria-valuetext={ariaValueText}
      >
        <div
          className="h-full rounded-full bg-gradient-to-r from-primary to-primary-container transition-[width] duration-200 ease-out"
          style={{ width: `${progress}%` }}
        />
      </div>
      {estimateText ? (
        <p className="mt-2 text-xs text-on-surface-variant font-body">{estimateText}</p>
      ) : null}
    </div>
  );
}
