// Status Badge — pill badge for the 11-state incident lifecycle.
// Rounded, modern, WCAG AA compliant contrast.

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
  escalated: { en: "Escalated", hi: "बढ़ाई गई" },
  closed: { en: "Closed", hi: "बंद" },
};

export function StatusBadge({
  status,
  lang = "en",
  className = "",
}: StatusBadgeProps) {
  const label = STATUS_LABELS[status]?.[lang] || status;

  let colorClasses = "bg-ink/8 text-ink/80";
  if (status === "resolved" || status === "closed") {
    colorClasses = "bg-pine/10 text-pine";
  } else if (status === "escalated") {
    colorClasses = "bg-brick/10 text-brick";
  } else if (status === "in_progress" || status === "assigned") {
    colorClasses = "bg-marigold/10 text-marigold";
  } else if (status === "reported") {
    colorClasses = "bg-ink/8 text-ink/60";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-full ${colorClasses} ${className}`}
    >
      {label}
    </span>
  );
}
