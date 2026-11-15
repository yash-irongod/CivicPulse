// Severity Indicator (Task 10.3, §7.2, §7.7).
// Strict adherence to §7.2: left-edge bar on a list row, NEVER a rounded colored chip with a dot.
// Adheres to §7.7: severity is never conveyed by color alone — always paired with text label.

import React from "react";
import type { Severity } from "@/lib/validation/transition";

interface SeverityIndicatorProps {
  severity?: Severity | string | null;
  className?: string;
  showLabel?: boolean;
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; barClass: string; textClass: string }
> = {
  critical: {
    label: "Critical",
    barClass: "bg-brick",
    textClass: "text-brick",
  },
  high: {
    label: "High",
    barClass: "bg-marigold",
    textClass: "text-marigold",
  },
  medium: {
    label: "Medium",
    barClass: "bg-ink/40",
    textClass: "text-ink/80",
  },
  low: {
    label: "Low",
    barClass: "bg-pine",
    textClass: "text-pine",
  },
};

export function SeverityIndicator({
  severity,
  className = "",
  showLabel = true,
}: SeverityIndicatorProps) {
  const normSeverity: Severity =
    severity === "critical" ||
    severity === "high" ||
    severity === "medium" ||
    severity === "low"
      ? severity
      : "medium";

  const config = SEVERITY_CONFIG[normSeverity];

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      {/* Left-edge bar: 3px wide, solid, never a rounded pill */}
      <span
        className={`w-[3px] h-4 self-stretch rounded-none ${config.barClass}`}
        aria-hidden="true"
      />
      {showLabel && (
        <span
          className={`text-xs font-medium tracking-normal ${config.textClass}`}
        >
          {config.label}
        </span>
      )}
    </div>
  );
}

/** Left-edge border helper class for list item rows (§7.2 ops-room style) */
export function getSeverityBorderClass(
  severity?: Severity | string | null,
): string {
  switch (severity) {
    case "critical":
      return "border-l-4 border-l-brick";
    case "high":
      return "border-l-4 border-l-marigold";
    case "low":
      return "border-l-4 border-l-pine";
    default:
      return "border-l-4 border-l-ink/30";
  }
}
