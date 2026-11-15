// Incident Tracking Timeline Component (Task 8.3, §6.5, §7.2, §7.4).
// Displays the incident's lifecycle stage in plain language with audit trail history.

"use client";

import React from "react";
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
  closed: "Closed",
};

// 5 Main Milestone Stages for non-technical residents
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

  return (
    <div className="space-y-6 pt-3">
      {/* Current Stage Highlight Ribbon */}
      <div className="flex items-center justify-between bg-ink/5 border border-ink/10 px-3 py-2 text-xs">
        <span className="text-ink/70 font-medium">Current Status:</span>
        <span className="font-bold text-ink flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-marigold inline-block"></span>
          {STATUS_LABELS[status] || status}
        </span>
      </div>

      {/* Visual Stepper Conduit */}
      <div className="relative px-2 py-1">
        {/* Background Track */}
        <div className="absolute top-3 left-6 right-6 h-[2px] bg-ink/15 z-0" />
        {/* Active Progress Fill */}
        <div
          className="absolute top-3 left-6 h-[2px] bg-pine transition-all duration-500 z-0"
          style={{
            width: `${(currentStep / (MILESTONE_STAGES.length - 1)) * 88}%`,
          }}
        />

        <div className="flex items-center justify-between relative z-10">
          {MILESTONE_STAGES.map((stage, idx) => {
            const isCompleted = idx < currentStep;
            const isCurrent = idx === currentStep;

            return (
              <div
                key={stage.key}
                className="flex flex-col items-center gap-2 group"
              >
                <div
                  className={`w-6 h-6 flex items-center justify-center transition-all ${
                    isCurrent
                      ? "bg-marigold text-on-marigold ring-4 ring-marigold/20 shadow-md font-bold scale-110"
                      : isCompleted
                        ? "bg-pine text-on-pine font-semibold"
                        : "bg-paper border-2 border-ink/30 text-ink/40"
                  }`}
                >
                  <span className="text-[10px] font-mono">
                    {isCompleted ? "✓" : idx + 1}
                  </span>
                </div>
                <span
                  className={`text-[10px] font-mono uppercase tracking-tight text-center ${
                    isCurrent
                      ? "font-bold text-ink"
                      : isCompleted
                        ? "font-medium text-ink/80"
                        : "text-ink/40"
                  }`}
                >
                  {stage.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity History */}
      {history.length > 0 && (
        <div className="border border-ink/15 bg-paper p-4 space-y-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-ink/10 pb-2">
            <h4 className="text-xs font-semibold text-ink">
              Updates & Activity
            </h4>
            <span className="text-[11px] text-ink/50">
              {history.length} {history.length === 1 ? "update" : "updates"}
            </span>
          </div>

          <div className="space-y-3">
            {history.map((item) => (
              <div
                key={item.id}
                className="text-xs flex flex-col border-l-2 border-l-marigold/60 pl-3 py-1 bg-ink/[0.02]"
              >
                <div className="flex items-center justify-between text-ink">
                  <span className="font-semibold text-xs">
                    {STATUS_LABELS[item.to_status] || item.to_status}
                  </span>
                  <span className="text-[10px] text-ink/50 font-mono">
                    {new Date(item.created_at).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
                {item.note && (
                  <p className="text-[11px] text-ink/75 mt-1 leading-relaxed">
                    {item.note}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
