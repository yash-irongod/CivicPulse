// Severity Indicator — accessible visual severity badge + left-border helper.
// Always pairs color with text label for accessibility (§7.2, §7.7).

import React from "react";
import type { Severity } from "@/lib/validation/transition";

interface SeverityIndicatorProps {
  severity?: Severity | string | null;
  className?: string;
  showLabel?: boolean;
}

const SEVERITY_CONFIG: Record<
  Severity,
  { label: string; bgClass: string; textClass: string; dotClass: string }
> = {
  critical: {
    label: "Critical",
    bgClass: "bg-brick/10",
    textClass: "text-brick",
    dotClass: "bg-brick",
  },
  high: {
    label: "High",
    bgClass: "bg-marigold/10",
    textClass: "text-marigold",
    dotClass: "bg-marigold",
  },
  medium: {
    label: "Medium",
    bgClass: "bg-ink/8",
    textClass: "text-ink/70",
    dotClass: "bg-ink/40",
  },
  low: {
    label: "Low",
    bgClass: "bg-pine/10",
    textClass: "text-pine",
    dotClass: "bg-pine",
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
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium ${config.bgClass} ${config.textClass} ${className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full ${config.dotClass}`}
        aria-hidden="true"
      />
      {showLabel && config.label}
    </span>
  );
}

/** Left-edge border helper class for list rows (§7.2) */
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
