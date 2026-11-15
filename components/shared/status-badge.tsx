// Status Badge (Task 10.3, §7.2, §7.7).
// Renders the ten-state incident lifecycle with WCAG AA compliant contrast.
// Plain language, sentence case, no decorative status pills with dots.

import React from "react";
import type { IncidentStatus } from "@/lib/validation/transition";

interface StatusBadgeProps {
  status: IncidentStatus | string;
  lang?: "en" | "hi";
  className?: string;
}

const STATUS_LABELS: Record<string, { en: string; hi: string }> = {
  reported: { en: "Reported", hi: "दर्ज की गई" },
  validated: { en: "Validated", hi: "सत्यापित" },
  prioritized: { en: "Prioritized", hi: "प्राथमिकता तय" },
  assigned: { en: "Assigned", hi: "सौंपी गई" },
  in_progress: { en: "In progress", hi: "कार्य प्रगति पर" },
  resolution_submitted: { en: "Resolution submitted", hi: "समाधान प्रस्तुत" },
  evidence_checked: { en: "Evidence checked", hi: "प्रमाण सत्यापित" },
  resolved: { en: "Resolved", hi: "हल हो गई" },
  resident_feedback: { en: "Feedback needed", hi: "प्रतिक्रिया आवश्यक" },
  closed: { en: "Closed", hi: "बंद" },
};

export function StatusBadge({
  status,
  lang = "en",
  className = "",
}: StatusBadgeProps) {
  const label = STATUS_LABELS[status]?.[lang] || status;

  let colorClasses = "bg-ink/10 text-ink";
  if (status === "resolved" || status === "closed") {
    colorClasses = "bg-pine text-on-pine";
  } else if (status === "in_progress" || status === "assigned") {
    colorClasses = "bg-marigold text-on-marigold";
  } else if (status === "reported") {
    colorClasses = "bg-ink/20 text-ink";
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-medium tracking-normal ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
}
