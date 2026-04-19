/**
 * Visual mapping: emergency ↔ severe (red), urgent ↔ moderate (amber), routine ↔ mild (green).
 */

export function triageBadgeClasses(level: string | null): string {
  if (level === "emergency") {
    return "bg-error-container text-on-error-container border-error shadow-sm";
  }
  if (level === "urgent") {
    return "bg-moderate-surface text-on-moderate border-moderate-outline shadow-sm";
  }
  if (level === "routine") {
    return "bg-mild-surface text-on-mild border-mild-outline shadow-sm";
  }
  return "bg-surface-container-high text-on-surface-variant border-outline-variant/30";
}

export function triageNoteBubbleClasses(level: string | null): string {
  if (level === "emergency") {
    return "bg-error-container text-on-error-container border-error shadow-sm";
  }
  if (level === "urgent") {
    return "bg-moderate-surface text-on-moderate border-moderate-outline shadow-sm";
  }
  if (level === "routine") {
    return "bg-mild-surface text-on-mild border-mild-outline shadow-sm";
  }
  return "bg-surface-container-high text-on-surface border-outline-variant/35";
}
