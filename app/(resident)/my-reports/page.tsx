// Resident My Reports Page (Task 8.3, §7.2, §7.4).
// High-tactility personal operations docket for residents with live SLA counters and interactive timeline conduit.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";

import { FeedbackConfirm } from "@/components/resident/feedback-confirm";
import {
  IncidentTimeline,
  STATUS_LABELS,
  type StatusHistoryItem,
} from "@/components/resident/timeline";
import { EmptyState } from "@/components/shared/empty-state";
import {
  SeverityIndicator,
  getSeverityBorderClass,
} from "@/components/shared/severity-indicator";

interface IssueItem {
  id: string;
  text: string | null;
  submittedAt: string;
  photoPaths: string[];
  category: { id: string; name: string } | null;
  incident: {
    id: string;
    status: string;
    severity: string | null;
    slaTargetAt: string | null;
    hoursRemaining: number | null;
    createdAt: string;
    resolvedAt: string | null;
    closedAt: string | null;
    history: StatusHistoryItem[];
  } | null;
}

export default function MyReportsPage() {
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIssueId, setExpandedIssueId] = useState<string | null>(null);
  const [feedbackIncidentId, setFeedbackIncidentId] = useState<string | null>(
    null,
  );

  const fetchIssues = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/resident/issues");
      if (!res.ok) throw new Error("Failed to load your reports.");
      const data = await res.json();
      setIssues(data.issues || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading reports.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, []);

  const toggleExpand = (id: string) => {
    setExpandedIssueId(expandedIssueId === id ? null : id);
  };

  const activeCount = issues.filter(
    (i) => i.incident?.status !== "closed" && i.incident?.status !== "resolved",
  ).length;
  const resolvedCount = issues.filter(
    (i) => i.incident?.status === "closed" || i.incident?.status === "resolved",
  ).length;

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-lg mx-auto">
        <header className="border-b border-ink/10 pb-3">
          <div className="h-5 bg-ink/10 w-1/3 mb-2 animate-pulse" />
          <div className="h-3 bg-ink/5 w-2/3 animate-pulse" />
        </header>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-4 border border-ink/10 bg-paper space-y-2 animate-pulse"
            >
              <div className="h-4 bg-ink/10 w-1/3" />
              <div className="h-3 bg-ink/10 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-16 max-w-lg mx-auto">
      {/* Header */}
      <header className="border-b border-ink/10 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-1.5 text-xs text-ink/70">
              <span className="w-2 h-2 rounded-full bg-pine inline-block" />
              <span>My Community</span>
            </div>
            <h1 className="text-xl font-bold text-ink tracking-tight mt-0.5">
              My Reports
            </h1>
          </div>

          <Link
            href="/report"
            className="text-xs font-semibold px-3.5 py-2 bg-marigold text-on-marigold hover:bg-marigold/90 shadow-sm flex items-center gap-1.5"
          >
            <span>+</span>
            <span>Report an Issue</span>
          </Link>
        </div>

        {/* Counter Strip */}
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-ink/10 text-xs font-mono">
          <span className="text-ink/60">
            Total Filed:{" "}
            <strong className="text-ink font-bold">{issues.length}</strong>
          </span>
          <span className="text-ink/30">•</span>
          <span className="text-marigold">
            In Progress: <strong className="font-bold">{activeCount}</strong>
          </span>
          <span className="text-ink/30">•</span>
          <span className="text-pine">
            Resolved: <strong className="font-bold">{resolvedCount}</strong>
          </span>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-mono">
          {error}
        </div>
      )}

      {issues.length === 0 ? (
        <EmptyState
          title="No reports filed"
          description="You haven't submitted any maintenance or community issues yet."
          actionLabel="File a Report"
          onAction={() => {
            window.location.href = "/report";
          }}
        />
      ) : (
        <div className="space-y-4">
          {issues.map((issue) => {
            const incident = issue.incident;
            const statusKey = incident?.status || "reported";
            const statusLabel = STATUS_LABELS[statusKey] || statusKey;
            const isExpanded = expandedIssueId === issue.id;
            const needsFeedback =
              statusKey === "resident_feedback" || statusKey === "resolved";
            const borderClass = getSeverityBorderClass(incident?.severity);

            return (
              <div
                key={issue.id}
                className={`bg-paper border border-ink/20 ${borderClass} shadow-sm transition-all duration-200 overflow-hidden`}
              >
                <div className="p-4 space-y-3">
                  {/* Top Metadata */}
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink bg-ink/5 px-2 py-0.5 border border-ink/10 text-[11px] font-mono">
                        {issue.category?.name || "General Maintenance"}
                      </span>
                      {incident?.severity && (
                        <SeverityIndicator
                          severity={incident.severity}
                          showLabel
                        />
                      )}
                    </div>

                    <span className="text-[11px] text-ink/60 font-mono">
                      {new Date(issue.submittedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {/* Issue Text / Summary */}
                  <p className="text-xs text-ink/90 leading-relaxed font-sans">
                    {issue.text || "Photo and voice incident capture"}
                  </p>

                  {/* Operational Status & SLA Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-ink/10 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-marigold" />
                      <span className="font-mono text-xs font-bold uppercase tracking-wider text-ink">
                        {statusLabel}
                      </span>
                    </div>

                    {incident?.hoursRemaining !== null &&
                      incident?.hoursRemaining !== undefined &&
                      statusKey !== "closed" && (
                        <div className="text-[11px] font-mono">
                          {incident.hoursRemaining > 0 ? (
                            <span className="text-pine font-medium px-2 py-0.5 bg-pine/10 border border-pine/20">
                              Target: {incident.hoursRemaining}h remaining
                            </span>
                          ) : (
                            <span className="text-brick font-bold px-2 py-0.5 bg-brick/10 border border-brick/30 animate-pulse">
                              Overdue: {Math.abs(incident.hoursRemaining)}h past
                              SLA
                            </span>
                          )}
                        </div>
                      )}
                  </div>

                  {/* Resident Feedback Confirmation Trigger (§8.4) */}
                  {needsFeedback && incident && (
                    <div className="pt-2">
                      {feedbackIncidentId === incident.id ? (
                        <FeedbackConfirm
                          incidentId={incident.id}
                          incidentTitle={issue.text || undefined}
                          onComplete={() => {
                            setFeedbackIncidentId(null);
                            fetchIssues();
                          }}
                          onCancel={() => setFeedbackIncidentId(null)}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setFeedbackIncidentId(incident.id)}
                          className="w-full py-2.5 px-3 bg-pine text-on-pine text-xs font-semibold hover:bg-pine/90 shadow-sm transition-all flex items-center justify-center gap-2"
                        >
                          <span>✓</span>
                          <span>Work Marked Done — Rate the Work</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expand Timeline Accordion Button */}
                  <div className="pt-2 flex justify-between items-center border-t border-ink/10">
                    <span className="text-[11px] font-mono text-ink/50">
                      #{issue.id.slice(0, 8)}
                    </span>
                    <button
                      type="button"
                      onClick={() => toggleExpand(issue.id)}
                      className="text-xs text-marigold font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>
                        {isExpanded
                          ? "Hide Progress Details"
                          : "View Progress Details"}
                      </span>
                      <span>{isExpanded ? "▲" : "▼"}</span>
                    </button>
                  </div>
                </div>

                {/* Expanded Chronological Timeline */}
                {isExpanded && incident && (
                  <div className="bg-ink/[0.02] border-t border-ink/15 p-4 sm:p-5">
                    <IncidentTimeline
                      status={incident.status}
                      history={incident.history}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
