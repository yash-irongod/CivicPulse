// Incident Timeline — clean stepper + activity feed.
// 5 milestone stages with smooth progress, plus chronological history.

"use client";

import React from "react";
import { motion } from "framer-motion";
import { Check } from "@/components/shared/icons";
import type { IncidentStatus } from "@/lib/lifecycle/state-machine";

export interface StatusHistoryItem {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
}

interface IncidentTimelineProps {
  status: IncidentStatus | string;
  history?: StatusHistoryItem[];
}

export const STATUS_LABELS: Record<string, string> = {
  reported: "Report Received",
  validated: "Verified by Society",
  prioritized: "Prioritized",
  assigned: "Assigned to Team",
  in_progress: "Work in Progress",
  resolution_submitted: "Resolution Submitted",
  evidence_checked: "Inspection Verified",
  resolved: "Resolved",
  resident_feedback: "Awaiting Your Feedback",
  escalated: "Under Admin Review",
  closed: "Closed",
};

const MILESTONE_STAGES = [
  { key: "reported", label: "Reported" },
  { key: "assigned", label: "Assigned" },
  { key: "in_progress", label: "In Progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export function getStatusStepIndex(status: string): number {
  switch (status) {
    case "reported":
    case "validated":
      return 0;
    case "prioritized":
    case "assigned":
      return 1;
    case "in_progress":
    case "resolution_submitted":
    case "evidence_checked":
      return 2;
    case "resolved":
    case "resident_feedback":
    case "escalated":
      return 3;
    case "closed":
      return 4;
    default:
      return 0;
  }
}

export function IncidentTimeline({
  status,
  history = [],
}: IncidentTimelineProps) {
  const currentStep = getStatusStepIndex(status);
  const progressRatio = currentStep / (MILESTONE_STAGES.length - 1);

  return (
    <div className="space-y-5">
      {/* Current status summary */}
      <div className="flex items-center justify-between bg-ink/[0.04] rounded-xl px-4 py-2.5">
        <span className="text-xs text-ink/60 font-medium">Current status</span>
        <span className="text-sm font-semibold text-ink flex items-center gap-2">
          <span
            className={`w-2 h-2 rounded-full ${
              status === "closed" || status === "resolved"
                ? "bg-pine"
                : status === "escalated"
                  ? "bg-brick"
                  : "bg-marigold"
            }`}
          />
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      {/* Visual stepper */}
      <div className="relative px-1 py-2">
        {/* Background track */}
        <div className="absolute top-[22px] left-[22px] right-[22px] h-[2px] bg-ink/10 z-0 rounded-full overflow-hidden">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: progressRatio }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            style={{ originX: 0 }}
            className="h-full w-full bg-pine rounded-full"
          />
        </div>

        <div className="flex items-center justify-between relative z-10">
          {MILESTONE_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep;

            return (
              <div key={stage.key} className="flex flex-col items-center gap-2">
                <motion.div
                  initial={false}
                  animate={{ scale: isCurrent ? 1.08 : 1 }}
                  transition={{ type: "spring", stiffness: 360, damping: 24 }}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors duration-200 ${
                    isCurrent
                      ? "bg-marigold text-on-marigold ring-4 ring-marigold/15 shadow-soft"
                      : isCompleted
                        ? "bg-pine text-on-pine"
                        : "bg-paper border border-ink/15 text-ink/35"
                  }`}
                >
                  {isCompleted ? (
                    <Check size={14} strokeWidth={3} />
                  ) : (
                    <span className="text-xs font-semibold">{idx + 1}</span>
                  )}
                </motion.div>
                <span
                  className={`text-[10px] sm:text-[11px] text-center max-w-[64px] leading-tight ${
                    isCurrent
                      ? "font-semibold text-ink"
                      : isCompleted
                        ? "font-medium text-ink/65"
                        : "text-ink/35"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity history */}
      {history.length > 0 && (
        <div className="bg-ink/[0.02] rounded-xl border border-ink/8 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink/6">
            <h4 className="text-xs font-semibold text-ink">Activity</h4>
            <span className="text-[11px] text-ink/45">
              {history.length} {history.length === 1 ? "update" : "updates"}
            </span>
          </div>

          <div className="divide-y divide-ink/5">
            {history.map((item) => (
              <div key={item.id} className="px-4 py-3 flex gap-3">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full bg-marigold/60 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-ink">
                      {STATUS_LABELS[item.to_status] || item.to_status}
                    </span>
                    <span className="text-[10px] text-ink/40 shrink-0 tabular-nums">
                      {new Date(item.created_at).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  {item.note && (
                    <p className="text-[11px] text-ink/60 mt-0.5 leading-relaxed">
                      {item.note}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
