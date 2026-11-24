// Maintenance Staff — Job Detail Page.
// Shows full incident info, linked issue photos, status history, and
// provides actions: Start Work, Add Note, Upload After Photo, Submit Resolution.
// Mobile-first layout for field staff on ordinary Android phones.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface IncidentDetail {
  id: string;
  description: string | null;
  categoryName: string | null;
  severity: string | null;
  status: string;
  teamName: string | null;
  slaTargetAt: string | null;
  hoursRemaining: number | null;
  isOverdue: boolean;
  createdAt: string;
  resolvedAt: string | null;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function MaintenanceJobDetailPage() {
  const params = useParams<{ id: string }>();
  const incidentId = params.id;

  const [incident, setIncident] = useState<IncidentDetail | null>(null);
  const [issues, setIssues] = useState<LinkedIssue[]>([]);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Action state
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Resolution form state
  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionPhoto, setResolutionPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -------------------------------------------
  // Fetch incident detail
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
            : "Failed to load incident details.",
        );
      }
      const data = await res.json();
      setIncident(data.incident);
      setIssues(data.issues || []);
      setTimeline(data.timeline || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading details.");
    } finally {
      setIsLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  // -------------------------------------------
  // Transition action (Start Work)
  // -------------------------------------------
  async function handleTransition(toStatus: string, note?: string) {
    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toStatus, note }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "invalid_transition"
            ? `Cannot move to "${toStatus}" from current status.`
            : `Transition failed: ${body.error || "unknown error"}`,
        );
      }
      setActionSuccess(
        `Status updated to: ${STATUS_LABELS[toStatus] || toStatus}`,
      );
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Action failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // -------------------------------------------
  // Submit Resolution (with after photo)
  // -------------------------------------------
  async function handleSubmitResolution() {
    if (!resolutionPhoto) {
      setActionError("Please attach a photo showing the completed work.");
      return;
    }

    setActionLoading(true);
    setActionError(null);
    setActionSuccess(null);
    try {
      const formData = new FormData();
      formData.append("afterPhoto", resolutionPhoto);
      if (resolutionNote.trim()) {
        formData.append("note", resolutionNote.trim());
      }

      const res = await fetch(`/api/incidents/${incidentId}/evidence-check`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "missing_after_photo"
            ? "Photo is required."
            : `Submission failed: ${body.error || "unknown error"}`,
        );
      }
      setActionSuccess("Resolution submitted and evidence check completed.");
      setShowResolutionForm(false);
      setResolutionNote("");
      setResolutionPhoto(null);
      setPhotoPreview(null);
      await fetchDetail();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : "Submission failed.");
    } finally {
      setActionLoading(false);
    }
  }

  // -------------------------------------------
  // Photo handling
  // -------------------------------------------
  function handlePhotoSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setResolutionPhoto(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  function clearPhoto() {
    setResolutionPhoto(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // -------------------------------------------
  // Loading / error states
  // -------------------------------------------
  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 bg-ink/10 w-1/3 rounded" />
        <div className="h-20 bg-ink/10 rounded" />
        <div className="h-32 bg-ink/10 rounded" />
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
          href="/maintenance"
          className="text-sm text-ink/60 hover:text-ink underline"
        >
          ← Back to work list
        </Link>
      </div>
    );
  }

  // -------------------------------------------
  // Determine available actions
  // -------------------------------------------
  const canStartWork = incident.status === "assigned";
  const canSubmitResolution = incident.status === "in_progress";
  const isWaitingReview =
    incident.status === "resolution_submitted" ||
    incident.status === "evidence_checked";
  const isComplete =
    incident.status === "resolved" || incident.status === "closed";

  return (
    <div className="space-y-6 pb-24">
      {/* Back link */}
      <Link
        href="/maintenance"
        className="text-xs text-ink/60 hover:text-ink underline"
      >
        ← Back to work list
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
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
          <span className="text-[10px] font-mono text-ink/40">
            #{incident.id.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-ink">
            {STATUS_LABELS[incident.status] || incident.status}
          </span>
          {incident.hoursRemaining !== null && !isComplete && (
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

      {/* Description */}
      <div className="p-4 border border-ink/10 bg-paper space-y-1">
        <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
          Description
        </div>
        <p className="text-sm text-ink leading-relaxed">
          {incident.description || "No description available."}
        </p>
        {incident.teamName && (
          <p className="text-xs text-ink/50 mt-2">Team: {incident.teamName}</p>
        )}
      </div>

      {/* Linked issue reports */}
      {issues.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
            Resident Reports ({issues.length})
          </div>
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="p-3 border border-ink/10 bg-paper space-y-2"
            >
              {issue.rawText && (
                <p className="text-sm text-ink">{issue.rawText}</p>
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
                          className="w-20 h-20 object-cover border border-ink/10"
                        />
                      </a>
                    ) : (
                      <div
                        key={i}
                        className="w-20 h-20 bg-ink/5 border border-ink/10 flex-shrink-0 flex items-center justify-center text-[10px] text-ink/30"
                      >
                        Photo unavailable
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="text-[10px] text-ink/40">
                {issue.reporterName && `Reported by ${issue.reporterName} · `}
                {new Date(issue.submittedAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          ))}
        </div>
      )}

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

      {/* Actions */}
      {canStartWork && (
        <div className="space-y-2">
          <button
            onClick={() =>
              handleTransition("in_progress", "Staff started work on-site.")
            }
            disabled={actionLoading}
            className="w-full py-3 bg-pine text-paper font-semibold text-sm hover:bg-pine/90 transition-colors disabled:opacity-50"
          >
            {actionLoading ? "Starting…" : "Start Work"}
          </button>
          <p className="text-[10px] text-ink/40 text-center">
            Tap when you arrive on-site and begin work.
          </p>
        </div>
      )}

      {canSubmitResolution && !showResolutionForm && (
        <div className="space-y-2">
          <button
            onClick={() => setShowResolutionForm(true)}
            className="w-full py-3 bg-pine text-paper font-semibold text-sm hover:bg-pine/90 transition-colors"
          >
            Submit Resolution
          </button>
          <p className="text-[10px] text-ink/40 text-center">
            Take a photo of the completed work and submit for review.
          </p>
        </div>
      )}

      {/* Resolution form */}
      {canSubmitResolution && showResolutionForm && (
        <div className="p-4 border border-pine/30 bg-pine/5 space-y-4">
          <div className="text-sm font-semibold text-ink">
            Submit Resolution Evidence
          </div>

          {/* Photo */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-ink/70">
              After Photo <span className="text-brick">*</span>
            </label>
            {photoPreview ? (
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Resolution photo preview"
                  className="w-full h-48 object-cover border border-ink/10"
                />
                <button
                  onClick={clearPhoto}
                  className="absolute top-2 right-2 w-7 h-7 bg-ink/80 text-paper text-sm flex items-center justify-center hover:bg-ink"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-6 border-2 border-dashed border-ink/20 text-ink/50 text-sm hover:border-ink/40 hover:text-ink/70 transition-colors"
              >
                Tap to take or select photo
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/heic"
              capture="environment"
              onChange={handlePhotoSelect}
              className="hidden"
            />
          </div>

          {/* Note */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-ink/70">
              Note (optional)
            </label>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Describe what was done…"
              rows={3}
              maxLength={1000}
              className="w-full p-3 border border-ink/15 bg-paper text-sm text-ink placeholder:text-ink/30 focus:outline-none focus:border-ink/40 resize-none"
            />
          </div>

          {/* Submit / Cancel */}
          <div className="flex gap-3">
            <button
              onClick={handleSubmitResolution}
              disabled={actionLoading || !resolutionPhoto}
              className="flex-1 py-3 bg-pine text-paper font-semibold text-sm hover:bg-pine/90 transition-colors disabled:opacity-50"
            >
              {actionLoading ? "Submitting…" : "Submit"}
            </button>
            <button
              onClick={() => {
                setShowResolutionForm(false);
                clearPhoto();
                setResolutionNote("");
              }}
              disabled={actionLoading}
              className="px-4 py-3 border border-ink/15 text-ink/60 text-sm hover:border-ink/30"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Waiting for review banner */}
      {isWaitingReview && (
        <div className="p-4 bg-marigold/10 border-l-4 border-marigold space-y-1">
          <div className="text-sm font-semibold text-marigold">
            Awaiting Committee Review
          </div>
          <p className="text-xs text-ink/60">
            Your resolution has been submitted. The committee will review the
            evidence and approve or request further work.
          </p>
          {incident.evidenceAiCheck && (
            <p className="text-xs text-ink/50 mt-2">
              AI assessment:{" "}
              {incident.evidenceAiCheck.consistent
                ? "Evidence looks consistent"
                : "Evidence may need review"}
              ({Math.round(incident.evidenceAiCheck.confidence * 100)}%
              confidence)
            </p>
          )}
        </div>
      )}

      {/* Completed banner */}
      {isComplete && (
        <div className="p-4 bg-pine/10 border-l-4 border-pine space-y-1">
          <div className="text-sm font-semibold text-pine">
            {incident.status === "closed" ? "Closed" : "Resolved"}
          </div>
          {incident.resolvedAt && (
            <p className="text-xs text-ink/50">
              Resolved on{" "}
              {new Date(incident.resolvedAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      )}

      {/* Status Timeline */}
      {timeline.length > 0 && (
        <div className="space-y-3">
          <div className="text-[10px] font-semibold text-ink/50 uppercase tracking-wider">
            Timeline
          </div>
          <div className="space-y-0">
            {timeline.map((entry, i) => (
              <div key={entry.id} className="flex gap-3">
                {/* Timeline line */}
                <div className="flex flex-col items-center">
                  <div
                    className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                      i === timeline.length - 1 ? "bg-pine" : "bg-ink/20"
                    }`}
                  />
                  {i < timeline.length - 1 && (
                    <div className="w-px flex-1 bg-ink/10 min-h-[24px]" />
                  )}
                </div>
                {/* Content */}
                <div className="pb-3 min-w-0">
                  <div className="text-xs font-medium text-ink">
                    {entry.fromStatus
                      ? `${STATUS_LABELS[entry.fromStatus] || entry.fromStatus} → ${STATUS_LABELS[entry.toStatus] || entry.toStatus}`
                      : STATUS_LABELS[entry.toStatus] || entry.toStatus}
                  </div>
                  {entry.note && (
                    <p className="text-[11px] text-ink/60 mt-0.5 break-words">
                      {entry.note}
                    </p>
                  )}
                  <div className="text-[10px] text-ink/40 mt-0.5">
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
    </div>
  );
}
