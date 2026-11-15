// Admin Incident Detail Page.
// Full incident view with linked issues, timeline, and administrative actions:
// - Advance incident through lifecycle states
// - Assign/reassign team and category
// - Review and approve/reject resolution evidence
// - View full audit trail

"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  VerifyResolution,
  type PendingVerification,
} from "@/components/admin/verify-resolution";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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
  resolutionNote: string | null;
  evidenceAiCheck: {
    consistent: boolean;
    confidence: number;
    reasoning: string;
  } | null;
}

interface LinkedIssue {
  id: string;
  rawText: string | null;
  rawTranscript: string | null;
  photoPaths: string[];
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STATUS_LABELS: Record<string, string> = {
  reported: "Reported",
  validated: "Validated",
  prioritized: "Prioritized",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolution_submitted: "Resolution Submitted",
  evidence_checked: "Evidence Checked",
  resolved: "Resolved",
  resident_feedback: "Awaiting Resident Feedback",
  closed: "Closed",
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-brick text-paper",
  high: "bg-marigold text-paper",
  medium: "bg-ink/10 text-ink",
  low: "bg-ink/5 text-ink/70",
};

// The allowed forward transitions an admin can trigger
const ADMIN_TRANSITIONS: Record<
  string,
  { to: string; label: string; confirm?: string }[]
> = {
  reported: [
    {
      to: "validated",
      label: "Validate",
      confirm: "Mark this incident as validated?",
    },
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
  evidence_checked: [
    // Handled by VerifyResolution component instead
  ],
  resolved: [{ to: "resident_feedback", label: "Request Resident Feedback" }],
  resident_feedback: [
    {
      to: "closed",
      label: "Close (Confirmed by Resident)",
      confirm: "Close this incident?",
    },
    {
      to: "assigned",
      label: "Reopen (Resident Disputed)",
      confirm: "Reopen and reassign this incident?",
    },
  ],
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AdminIncidentDetailPage() {
  const params = useParams<{ id: string }>();
  const incidentId = params.id;

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [issues, setIssues] = useState<LinkedIssue[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Admin action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null);

  // Assignment state
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [teams, setTeams] = useState<FilterOption[]>([]);

  // -------------------------------------------
  // Fetch data
  // -------------------------------------------
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

  // Load filter options for assignment dropdowns
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

  // -------------------------------------------
  // Transition
  // -------------------------------------------
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

  // -------------------------------------------
  // Assignment update (team or category)
  // -------------------------------------------
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

  // -------------------------------------------
  // Severity update
  // -------------------------------------------
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

  // -------------------------------------------
  // Loading / Error states
  // -------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 bg-ink/10 w-1/4 rounded" />
        <div className="h-24 bg-ink/10 rounded" />
        <div className="h-40 bg-ink/10 rounded" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-brick/10 border-l-4 border-brick text-sm text-brick">
          {error || "Incident not found."}
        </div>
        <Link
          href="/incidents"
          className="text-sm text-ink/60 hover:text-ink underline"
        >
          ← Back to incident queue
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
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/incidents"
        className="text-xs text-ink/60 hover:text-ink underline"
      >
        ← Back to incident queue
      </Link>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-ink/5 border border-ink/15 text-ink">
              #{incident.id.slice(0, 8)}
            </span>
            {incident.severity && (
              <span
                className={`text-[10px] font-bold uppercase px-2 py-0.5 ${SEVERITY_COLORS[incident.severity] || "bg-ink/10 text-ink"}`}
              >
                {incident.severity}
              </span>
            )}
            {incident.categoryName && (
              <span className="text-[11px] text-ink/60 bg-ink/5 px-2 py-0.5">
                {incident.categoryName}
              </span>
            )}
          </div>
          <h1 className="text-lg font-bold text-ink leading-snug">
            {incident.description || "Reported Issue"}
          </h1>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-sm font-semibold text-ink border border-ink/15 px-3 py-1">
            {STATUS_LABELS[incident.status] || incident.status}
          </span>
          {incident.hoursRemaining !== null && !isTerminal && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 ${
                incident.isOverdue
                  ? "bg-brick/10 text-brick font-bold"
                  : incident.hoursRemaining < 2
                    ? "bg-marigold/10 text-marigold font-semibold"
                    : "bg-pine/10 text-pine"
              }`}
            >
              {incident.isOverdue
                ? `${Math.abs(incident.hoursRemaining).toFixed(1)}h overdue`
                : `${incident.hoursRemaining.toFixed(1)}h remaining`}
            </span>
          )}
        </div>
      </div>

      {/* Action feedback */}
      {actionError && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="p-3 bg-pine/10 border-l-4 border-pine text-xs text-pine font-medium">
          {actionSuccess}
        </div>
      )}

      {/* Admin Assignment Panel */}
      {!isTerminal && (
        <div className="border border-ink/10 bg-paper p-4 space-y-3">
          <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
            Assignment & Classification
          </div>
          <div className="flex flex-wrap gap-4">
            {/* Category */}
            <div className="space-y-1">
              <label className="text-[10px] text-ink/60">Category</label>
              <select
                value={incident.categoryId || ""}
                onChange={(e) => handleAssign("categoryId", e.target.value)}
                disabled={actionLoading}
                className="text-xs p-2 border border-ink/15 bg-paper text-ink focus:outline-none focus:border-marigold min-w-[160px]"
              >
                <option value="">
                  {incident.categoryName || "Select Category"}
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Team */}
            <div className="space-y-1">
              <label className="text-[10px] text-ink/60">Assigned Team</label>
              <select
                value={incident.teamId || ""}
                onChange={(e) => handleAssign("assignedTeamId", e.target.value)}
                disabled={actionLoading}
                className="text-xs p-2 border border-ink/15 bg-paper text-ink focus:outline-none focus:border-marigold min-w-[160px]"
              >
                <option value="">{incident.teamName || "Select Team"}</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Severity */}
            <div className="space-y-1">
              <label className="text-[10px] text-ink/60">Severity</label>
              <select
                value={incident.severity || ""}
                onChange={(e) => handleSeverity(e.target.value)}
                disabled={actionLoading}
                className="text-xs p-2 border border-ink/15 bg-paper text-ink focus:outline-none focus:border-marigold min-w-[120px]"
              >
                <option value="">Set Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Lifecycle Actions */}
      {availableTransitions.length > 0 && (
        <div className="border border-ink/10 bg-paper p-4 space-y-3">
          <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
            Advance Status
          </div>
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
                  className="py-2 px-4 bg-pine text-paper text-xs font-semibold hover:bg-pine/90 transition-colors disabled:opacity-50"
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
                      className="text-xs p-2 border border-ink/15 bg-paper text-ink focus:outline-none flex-1"
                    />
                    <button
                      onClick={() => handleTransition(t.to)}
                      disabled={actionLoading}
                      className="py-2 px-3 bg-pine text-paper text-xs font-semibold disabled:opacity-50"
                    >
                      Confirm
                    </button>
                    <button
                      onClick={() => {
                        setShowNoteFor(null);
                        setTransitionNote("");
                      }}
                      className="py-2 px-2 text-xs text-ink/50 hover:text-ink"
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

      {/* Verify Resolution (for evidence_checked / resolution_submitted) */}
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
              aiEvidenceCheck: incident.evidenceAiCheck,
              createdAt: incident.createdAt,
            } satisfies PendingVerification
          }
          onProcessed={fetchDetail}
        />
      )}

      {/* Linked Issues */}
      {issues.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
            Linked Resident Reports ({issues.length})
          </div>
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="p-4 border border-ink/10 bg-paper space-y-2"
            >
              {issue.rawText && (
                <p className="text-sm text-ink leading-relaxed">
                  {issue.rawText}
                </p>
              )}
              {issue.rawTranscript && (
                <div className="text-xs text-ink/70 bg-ink/[0.02] p-2 border-l-2 border-ink/10">
                  <span className="font-semibold text-ink/50">
                    Voice transcript:
                  </span>{" "}
                  {issue.rawTranscript}
                </div>
              )}
              {issue.photoPaths.length > 0 && (
                <div className="flex gap-2 overflow-x-auto">
                  {issue.photoPaths.map((path, i) => (
                    <div
                      key={i}
                      className="w-20 h-20 bg-ink/5 border border-ink/10 flex-shrink-0 flex items-center justify-center text-[10px] text-ink/30"
                    >
                      📷 Photo {i + 1}
                    </div>
                  ))}
                </div>
              )}
              <div className="text-[10px] text-ink/40 flex gap-2 flex-wrap">
                <span className="font-mono">#{issue.id.slice(0, 8)}</span>
                {issue.reporterName && <span>by {issue.reporterName}</span>}
                <span>
                  {new Date(issue.submittedAt).toLocaleDateString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
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
          <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
            Audit Trail
          </div>
          <div className="border border-ink/10 bg-paper divide-y divide-ink/5">
            {timeline.map((entry) => (
              <div key={entry.id} className="p-3 flex gap-3 text-xs">
                <div className="w-2 h-2 rounded-full bg-ink/20 mt-1 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="font-medium text-ink">
                    {entry.fromStatus
                      ? `${STATUS_LABELS[entry.fromStatus] || entry.fromStatus} → ${STATUS_LABELS[entry.toStatus] || entry.toStatus}`
                      : STATUS_LABELS[entry.toStatus] || entry.toStatus}
                  </div>
                  {entry.note && (
                    <p className="text-ink/60 mt-0.5 break-words">
                      {entry.note}
                    </p>
                  )}
                  <div className="text-ink/40 mt-0.5">
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

      {/* Metadata footer */}
      <div className="border-t border-ink/10 pt-3 text-[10px] text-ink/40 space-y-0.5">
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
        <div className="font-mono">Full ID: {incident.id}</div>
      </div>
    </div>
  );
}
