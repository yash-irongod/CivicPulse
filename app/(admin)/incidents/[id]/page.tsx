// Admin Incident Detail — full incident view with admin actions.
// Clean sections, modern cards, no ops-room jargon.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  VerifyResolution,
  type PendingVerification,
} from "@/components/admin/verify-resolution";
import {
  ArrowLeft,
  Star,
  AlertTriangle,
  Circle,
} from "@/components/shared/icons";

// Types
interface IncidentDetail {
  id: string;
  communityId: string;
  description: string | null;
  categoryId: string | null;
  categoryName: string | null;
  severity: string | null;
  status: string;
  teamId: string | null;
  teamName: string | null;
  slaTargetAt: string | null;
  hoursRemaining: number | null;
  isOverdue: boolean;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  possibleDuplicateOf: string | null;
  resolutionBeforePhoto: string | null;
  resolutionAfterPhoto: string | null;
  resolutionBeforePhotoUrl: string | null;
  resolutionAfterPhotoUrl: string | null;
  resolutionNote: string | null;
  evidenceAiCheck: {
    consistent: boolean;
    confidence: number;
    reasoning: string;
  } | null;
  feedbackRating: number | null;
  feedbackComment: string | null;
  feedbackAt: string | null;
}

interface LinkedIssue {
  id: string;
  rawText: string | null;
  rawTranscript: string | null;
  photoPaths: string[];
  photoUrls?: (string | null)[];
  submittedAt: string;
  reporterName: string | null;
}

interface TimelineEntry {
  id: string;
  fromStatus: string | null;
  toStatus: string;
  note: string | null;
  createdAt: string;
  actorName: string;
}

interface FilterOption {
  id: string;
  name: string;
}

// Constants
const STATUS_LABELS: Record<string, string> = {
  reported: "Reported",
  validated: "Validated",
  prioritized: "Prioritized",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolution_submitted: "Resolution Submitted",
  evidence_checked: "Evidence Checked",
  resolved: "Resolved",
  resident_feedback: "Awaiting Feedback",
  escalated: "Escalated",
  closed: "Closed",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "bg-brick/10 text-brick",
  high: "bg-marigold/10 text-marigold",
  medium: "bg-ink/8 text-ink/70",
  low: "bg-ink/5 text-ink/50",
};

const ADMIN_TRANSITIONS: Record<
  string,
  { to: string; label: string; confirm?: string }[]
> = {
  reported: [
    { to: "validated", label: "Validate", confirm: "Mark as validated?" },
  ],
  validated: [
    {
      to: "prioritized",
      label: "Set Priority",
      confirm: "Advance to prioritized?",
    },
  ],
  prioritized: [
    { to: "assigned", label: "Assign", confirm: "Advance to assigned?" },
  ],
  evidence_checked: [],
  resolved: [{ to: "resident_feedback", label: "Request Resident Feedback" }],
  resident_feedback: [],
  escalated: [
    {
      to: "assigned",
      label: "Reopen for Rework",
      confirm: "Reopen this incident for rework?",
    },
    {
      to: "closed",
      label: "Close (Override)",
      confirm: "Close despite the low rating?",
    },
  ],
};

export default function AdminIncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const incidentId = params.id;

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [issues, setIssues] = useState<LinkedIssue[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);

  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [teams, setTeams] = useState<FilterOption[]>([]);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "not_found"
            ? "Incident not found."
            : "Failed to load incident.",
        );
      }
      const data = await res.json();
      setIncident(data.incident);
      setIssues(data.issues || []);
      setTimeline(data.timeline || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading incident.");
    } finally {
      setIsLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    async function loadFilters() {
      try {
        const [catRes, teamRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/admin/teams"),
        ]);
        if (catRes.ok) {
          const data = await catRes.json();
          setCategories(data.categories || []);
        }
        if (teamRes.ok) {
          const data = await teamRes.json();
          setTeams(
            (data.teams || []).map(
              (
                t: {
                  teamId?: string;
                  id?: string;
                  teamName?: string;
                  name?: string;
                },
                i: number,
              ) => ({
                id: t.teamId || t.id || `team-${i}`,
                name: t.teamName || t.name || `Team ${i + 1}`,
              }),
            ),
          );
        }
      } catch {
        // Non-critical
      }
    }
    loadFilters();
  }, []);

  async function handleTransition(toStatus: string) {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const body: Record<string, unknown> = { toStatus };
      if (transitionNote.trim()) body.note = transitionNote.trim();

      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(
          err.error === "invalid_transition"
            ? `Cannot transition to "${toStatus}" from current status.`
            : `Transition failed: ${err.error || "unknown"}`,
        );
      }
      setActionSuccess(
        `Status updated to: ${STATUS_LABELS[toStatus] || toStatus}`,
      );
      setTransitionNote("");
      setShowNoteFor(null);
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssign(
    field: "assignedTeamId" | "categoryId",
    value: string,
  ) {
    if (!value) return;
    setActionLoading(true);
    setActionError(null);
    try {
      const body: Record<string, string> = { [field]: value };
      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Assignment failed.");
      }
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Assignment failed.");
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSeverity(severity: string) {
    setActionLoading(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Severity update failed.");
      }
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Update failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // Loading
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 bg-ink/8 w-1/4 rounded-lg" />
        <div className="h-24 bg-ink/6 rounded-xl" />
        <div className="h-40 bg-ink/6 rounded-xl" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-brick/8 border border-brick/15 rounded-xl text-sm text-brick">
          {error || "Incident not found."}
        </div>
        <Link
          href="/incidents"
          className="text-sm text-ink/50 hover:text-ink inline-flex items-center gap-1 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to incidents
        </Link>
      </div>
    );
  }

  const availableTransitions = ADMIN_TRANSITIONS[incident.status] || [];
  const showVerifyResolution =
    incident.status === "evidence_checked" ||
    incident.status === "resolution_submitted";
  const isTerminal = incident.status === "closed";

  return (
    <div className="space-y-6 pb-8">
      {/* Back */}
      <Link
        href="/incidents"
        className="text-sm text-ink/40 hover:text-ink inline-flex items-center gap-1.5 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to incidents
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs text-ink/40">
              #{incident.id.slice(0, 8)}
            </span>
            {incident.severity && (
              <span
                className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${SEVERITY_STYLES[incident.severity] || "bg-ink/8 text-ink/60"}`}
              >
                {incident.severity}
              </span>
            )}
            {incident.categoryName && (
              <span className="text-[11px] text-ink/50 bg-ink/4 px-2.5 py-0.5 rounded-full">
                {incident.categoryName}
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-ink leading-snug">
            {incident.description || "Reported Issue"}
          </h1>
        </div>

        <div className="flex flex-col items-start sm:items-end gap-1.5 shrink-0">
          <span className="text-sm font-medium text-ink bg-ink/5 px-3 py-1.5 rounded-lg">
            {STATUS_LABELS[incident.status] || incident.status}
          </span>
          {incident.hoursRemaining !== null && !isTerminal && (
            <span
              className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                incident.isOverdue
                  ? "bg-brick/8 text-brick"
                  : incident.hoursRemaining < 2
                    ? "bg-marigold/8 text-marigold"
                    : "bg-pine/8 text-pine"
              }`}
            >
              {incident.isOverdue
                ? `${Math.abs(incident.hoursRemaining).toFixed(1)}h overdue`
                : `${incident.hoursRemaining.toFixed(1)}h remaining`}
            </span>
          )}
        </div>
      </div>

      {/* Feedback notices */}
      {actionError && (
        <div className="p-3 bg-brick/8 border border-brick/15 rounded-xl text-sm text-brick">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-pine/8 border border-pine/15 rounded-xl text-sm text-pine">
          {actionSuccess}
        </div>
      )}

      {/* Assignment panel */}
      {!isTerminal && (
        <div className="bg-paper border border-ink/8 rounded-2xl p-5 space-y-4 shadow-soft">
          <h3 className="text-xs font-semibold text-ink/60">
            Assignment & classification
          </h3>
          <div className="flex flex-wrap gap-4">
            <div className="space-y-1.5">
              <label className="text-xs text-ink/50">Category</label>
              <select
                value={incident.categoryId || ""}
                onChange={(e) => handleAssign("categoryId", e.target.value)}
                disabled={actionLoading}
                className="text-sm p-2.5 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50 min-w-[160px]"
              >
                <option value="">
                  {incident.categoryName || "Select category"}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-ink/50">Team</label>
              <select
                value={incident.teamId || ""}
                onChange={(e) => handleAssign("assignedTeamId", e.target.value)}
                disabled={actionLoading}
                className="text-sm p-2.5 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50 min-w-[160px]"
              >
                <option value="">{incident.teamName || "Select team"}</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs text-ink/50">Severity</label>
              <select
                value={incident.severity || ""}
                onChange={(e) => handleSeverity(e.target.value)}
                disabled={actionLoading}
                className="text-sm p-2.5 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50 min-w-[120px]"
              >
                <option value="">Set severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Lifecycle actions */}
      {availableTransitions.length > 0 && (
        <div className="bg-paper border border-ink/8 rounded-2xl p-5 space-y-4 shadow-soft">
          <h3 className="text-xs font-semibold text-ink/60">Advance status</h3>
          <div className="flex flex-wrap gap-3">
            {availableTransitions.map((t) => (
              <div key={t.to} className="space-y-2">
                <button
                  onClick={() => {
                    if (t.confirm && !showNoteFor) {
                      setShowNoteFor(t.to);
                    } else {
                      handleTransition(t.to);
                    }
                  }}
                  disabled={actionLoading}
                  className="py-2.5 px-5 bg-pine text-paper text-sm font-semibold rounded-lg hover:bg-pine/90 transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  {actionLoading ? "Updating…" : t.label}
                </button>
                {showNoteFor === t.to && (
                  <div className="flex gap-2 items-end">
                    <input
                      type="text"
                      placeholder="Optional note…"
                      value={transitionNote}
                      onChange={(e) => setTransitionNote(e.target.value)}
                      className="text-sm p-2.5 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none flex-1"
                    />
                    <button
                      onClick={() => handleTransition(t.to)}
                      disabled={actionLoading}
                      className="py-2.5 px-4 bg-pine text-paper text-sm font-semibold rounded-lg disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setShowNoteFor(null);
                        setTransitionNote("");
                      }}
                      className="py-2.5 px-3 text-sm text-ink/40 hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Verify resolution */}
      {showVerifyResolution && (
        <VerifyResolution
          item={
            {
              id: incident.id,
              description: incident.description,
              status: incident.status,
              severity: incident.severity,
              assignedTeamId: incident.teamId,
              teamName: incident.teamName,
              resolutionNotes: incident.resolutionNote,
              beforePhotoPath: incident.resolutionBeforePhoto,
              afterPhotoPath: incident.resolutionAfterPhoto,
              beforePhotoUrl: incident.resolutionBeforePhotoUrl,
              afterPhotoUrl: incident.resolutionAfterPhotoUrl,
              aiEvidenceCheck: incident.evidenceAiCheck,
              createdAt: incident.createdAt,
            } satisfies PendingVerification
          }
          onProcessed={fetchDetail}
        />
      )}

      {/* Escalation card */}
      {incident.status === "escalated" && (
        <div className="border border-marigold/20 bg-marigold/[0.03] rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-marigold" />
              <span className="text-sm font-semibold text-ink">
                Escalated by Resident
              </span>
            </div>
            <span className="text-xs font-medium text-marigold bg-marigold/10 px-2.5 py-1 rounded-full">
              Needs decision
            </span>
          </div>

          {incident.feedbackRating !== null && (
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex gap-0.5">
                  {[1, 2, 3, 4, 5].map((s) => (
                    <Star
                      key={s}
                      size={18}
                      className={
                        s <= incident.feedbackRating!
                          ? "text-marigold fill-marigold"
                          : "text-ink/15"
                      }
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-ink">
                  {incident.feedbackRating}/5
                </span>
              </div>
              {incident.feedbackComment && (
                <div className="text-sm text-ink/70 bg-paper p-3 rounded-lg border border-ink/6">
                  &ldquo;{incident.feedbackComment}&rdquo;
                </div>
              )}
              {incident.feedbackAt && (
                <div className="text-[11px] text-ink/35">
                  Feedback submitted:{" "}
                  {new Date(incident.feedbackAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </div>
          )}

          <p className="text-xs text-ink/50">
            The resident rated this work poorly. You can reopen the ticket for
            rework or close it if you believe the work was adequate.
          </p>
        </div>
      )}

      {/* Linked issues */}
      {issues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-ink/60">
            Linked reports ({issues.length})
          </h3>
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="p-4 border border-ink/8 bg-paper rounded-xl space-y-2"
            >
              {issue.rawText && (
                <p className="text-sm text-ink leading-relaxed">
                  {issue.rawText}
                </p>
              )}
              {issue.rawTranscript && (
                <div className="text-xs text-ink/60 bg-ink/[0.02] p-3 border-l-2 border-ink/8 rounded-r-lg">
                  <span className="text-ink/40 font-medium">
                    Voice transcript:
                  </span>{" "}
                  {issue.rawTranscript}
                </div>
              )}
              {issue.photoPaths.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {issue.photoPaths.map((path, i) => {
                    const url = issue.photoUrls?.[i];
                    return url ? (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-shrink-0"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Issue photo ${i + 1}`}
                          className="w-20 h-20 object-cover border border-ink/8 rounded-lg"
                        />
                      </a>
                    ) : (
                      <div
                        key={i}
                        className="w-20 h-20 bg-ink/4 border border-ink/8 flex-shrink-0 flex items-center justify-center text-[10px] text-ink/25 rounded-lg"
                      >
                        No photo
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="text-[11px] text-ink/35 flex gap-2 flex-wrap">
                <span className="font-mono">#{issue.id.slice(0, 8)}</span>
                {issue.reporterName && <span>by {issue.reporterName}</span>}
                <span>
                  {new Date(issue.submittedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold text-ink/60">Activity log</h3>
          <div className="border border-ink/8 bg-paper rounded-xl divide-y divide-ink/5 overflow-hidden">
            {timeline.map((entry) => (
              <div key={entry.id} className="p-4 flex gap-3">
                <Circle
                  size={8}
                  className="text-ink/15 mt-1.5 shrink-0 fill-ink/15"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">
                    {entry.fromStatus
                      ? `${STATUS_LABELS[entry.fromStatus] || entry.fromStatus} → ${STATUS_LABELS[entry.toStatus] || entry.toStatus}`
                      : STATUS_LABELS[entry.toStatus] || entry.toStatus}
                  </div>
                  {entry.note && (
                    <p className="text-xs text-ink/50 mt-0.5">{entry.note}</p>
                  )}
                  <div className="text-[11px] text-ink/30 mt-0.5">
                    {entry.actorName} ·{" "}
                    {new Date(entry.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="border-t border-ink/6 pt-4 text-[11px] text-ink/30 space-y-0.5">
        <div>
          Created: {new Date(incident.createdAt).toLocaleString("en-IN")}
        </div>
        {incident.resolvedAt && (
          <div>
            Resolved: {new Date(incident.resolvedAt).toLocaleString("en-IN")}
          </div>
        )}
        {incident.closedAt && (
          <div>
            Closed: {new Date(incident.closedAt).toLocaleString("en-IN")}
          </div>
        )}
        <div className="font-mono">ID: {incident.id}</div>
      </div>
    </div>
  );
}
