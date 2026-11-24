// My Reports — resident's personal report tracker.
// Clean card layout, severity indicators, expandable photo gallery & timeline.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { FeedbackConfirm } from "@/components/resident/feedback-confirm";
import {
  IncidentTimeline,
  STATUS_LABELS,
  type StatusHistoryItem,
} from "@/components/resident/timeline";
import { EmptyState } from "@/components/shared/empty-state";
import { useCommunityShell } from "@/components/shared/community-context";
import {
  SeverityIndicator,
  getSeverityBorderClass,
} from "@/components/shared/severity-indicator";
import {
  Plus,
  ChevronDown,
  ChevronUp,
  Clock,
  CheckCircle2,
  ClipboardList,
  Star,
} from "@/components/shared/icons";

interface IssueItem {
  id: string;
  text: string | null;
  submittedAt: string;
  photoPaths: string[];
  photoUrls?: (string | null)[];
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
  const { assets } = useCommunityShell();
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
      <div className="space-y-4">
        <div className="h-6 bg-ink/8 w-32 rounded-lg animate-pulse" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="p-5 border border-ink/8 rounded-2xl space-y-3 animate-pulse"
            >
              <div className="h-4 bg-ink/8 w-1/3 rounded" />
              <div className="h-3 bg-ink/6 w-3/4 rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      {/* Header */}
      <header className="space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-ink tracking-tight">
            My Reports
          </h1>
          <Link
            href="/report"
            className="inline-flex items-center gap-1.5 text-sm font-semibold px-4 py-2 bg-ink text-paper rounded-xl hover:bg-ink/90 transition-all active:scale-[0.98]"
          >
            <Plus size={15} />
            <span>New Report</span>
          </Link>
        </div>

        {/* Stats pills */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-ink/5 rounded-full text-ink/70 font-medium">
            <ClipboardList size={13} />
            {issues.length} total
          </span>
          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-marigold/10 rounded-full text-marigold font-medium">
              <Clock size={13} />
              {activeCount} active
            </span>
          )}
          {resolvedCount > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pine/10 rounded-full text-pine font-medium">
              <CheckCircle2 size={13} />
              {resolvedCount} resolved
            </span>
          )}
        </div>
      </header>

      {error && (
        <div className="p-3 bg-brick/8 border border-brick/15 rounded-xl text-sm text-brick">
          {error}
        </div>
      )}

      {issues.length === 0 ? (
        <EmptyState
          title="No reports yet"
          description="You haven't reported any issues. Tap below whenever something around your society needs repair."
          imageSrc={assets.emptyReports}
          imageAlt="No reports illustration"
          icon={<ClipboardList size={44} />}
          actionLabel="Report an Issue"
          onAction={() => {
            window.location.href = "/report";
          }}
        />
      ) : (
        <div className="space-y-3">
          {issues.map((issue) => {
            const incident = issue.incident;
            const statusKey = incident?.status || "reported";
            const statusLabel = STATUS_LABELS[statusKey] || statusKey;
            const isExpanded = expandedIssueId === issue.id;
            const needsFeedback =
              statusKey === "resident_feedback" || statusKey === "resolved";
            const borderClass = getSeverityBorderClass(incident?.severity);
            const validPhotoUrls = (issue.photoUrls || []).filter(
              (u): u is string => Boolean(u),
            );

            return (
              <div
                key={issue.id}
                className={`bg-paper border border-ink/8 ${borderClass} rounded-2xl shadow-soft transition-all duration-200 overflow-hidden`}
              >
                <div className="p-4 sm:p-5 space-y-3">
                  {/* Top: Category + Date */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-ink/70 bg-ink/5 px-2.5 py-1 rounded-full">
                        {issue.category?.name || "General"}
                      </span>
                      {incident?.severity && (
                        <SeverityIndicator
                          severity={incident.severity}
                          showLabel
                        />
                      )}
                    </div>
                    <span className="text-[11px] text-ink/45 shrink-0 tabular-nums">
                      {new Date(issue.submittedAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                      })}
                    </span>
                  </div>

                  {/* Issue text */}
                  <p className="text-sm text-ink/90 leading-relaxed">
                    {issue.text || "Photo or voice report"}
                  </p>

                  {/* Status bar */}
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          statusKey === "closed" || statusKey === "resolved"
                            ? "bg-pine"
                            : statusKey === "escalated"
                              ? "bg-brick"
                              : "bg-marigold"
                        }`}
                      />
                      <span className="text-xs font-medium text-ink/75">
                        {statusLabel}
                      </span>
                    </div>

                    {incident?.hoursRemaining !== null &&
                      incident?.hoursRemaining !== undefined &&
                      statusKey !== "closed" && (
                        <span
                          className={`text-[11px] font-medium px-2.5 py-1 rounded-full tabular-nums ${
                            incident.hoursRemaining > 0
                              ? "bg-pine/10 text-pine"
                              : "bg-brick/10 text-brick"
                          }`}
                        >
                          {incident.hoursRemaining > 0
                            ? `${Math.ceil(incident.hoursRemaining)}h left`
                            : `${Math.abs(Math.round(incident.hoursRemaining))}h overdue`}
                        </span>
                      )}
                  </div>

                  {/* Feedback button */}
                  {needsFeedback && incident && (
                    <div className="pt-1">
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
                          className="w-full py-2.5 px-4 bg-pine text-on-pine text-sm font-semibold rounded-xl hover:bg-pine/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                        >
                          <Star size={15} />
                          <span>Rate the Work</span>
                        </button>
                      )}
                    </div>
                  )}

                  {/* Expand toggle */}
                  <button
                    type="button"
                    onClick={() => toggleExpand(issue.id)}
                    className="w-full flex items-center justify-between pt-2.5 border-t border-ink/6 text-xs text-ink/45 hover:text-ink/75 transition-colors"
                  >
                    <span className="font-mono">#{issue.id.slice(0, 8)}</span>
                    <span className="flex items-center gap-1 font-medium">
                      {isExpanded ? "Hide details" : "View details"}
                      {isExpanded ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </span>
                  </button>
                </div>

                {/* Expanded photos + timeline */}
                <AnimatePresence initial={false}>
                  {isExpanded && incident && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden border-t border-ink/6 bg-ink/[0.015]"
                    >
                      <div className="p-4 sm:p-5 space-y-5">
                        {validPhotoUrls.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs font-medium text-ink/55 block">
                              Attached photo
                              {validPhotoUrls.length > 1 ? "s" : ""}
                            </span>
                            <div className="flex gap-2 overflow-x-auto pb-1">
                              {validPhotoUrls.map((url, idx) => (
                                <a
                                  key={idx}
                                  href={url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="shrink-0 rounded-xl overflow-hidden border border-ink/10 hover:opacity-90 transition-opacity"
                                >
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img
                                    src={url}
                                    alt={`Report photo ${idx + 1}`}
                                    className="w-20 h-20 object-cover"
                                  />
                                </a>
                              ))}
                            </div>
                          </div>
                        )}

                        <IncidentTimeline
                          status={incident.status}
                          history={incident.history}
                        />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
