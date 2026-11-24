// Maintenance Staff — Job Detail Page.
// Clear mobile field-staff workflow: inspect photos, Start Work, attach proof photo & Submit Resolution.

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SeverityIndicator } from "@/components/shared/severity-indicator";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Circle,
  Loader2,
  X,
  Sparkles,
} from "@/components/shared/icons";

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
  escalated: "Under Committee Review",
  closed: "Closed",
};

export default function MaintenanceJobDetailPage() {
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

  const [showResolutionForm, setShowResolutionForm] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [resolutionPhoto, setResolutionPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDetail = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${incidentId}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body.error === "not_found"
            ? "Task not found."
            : "Failed to load task details.",
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
            ? `Cannot update to "${toStatus}" right now.`
            : `Update failed: ${body.error || "unknown error"}`,
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

  async function handleSubmitResolution() {
    if (!resolutionPhoto) {
      setActionError("Please attach an after-photo showing the completed fix.");
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
      setActionSuccess("Resolution submitted for committee review.");
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

  if (isLoading) {
    return (
      <div className="space-y-4 animate-pulse">
        <div className="h-5 bg-ink/10 w-1/3 rounded-lg" />
        <div className="h-24 bg-ink/8 rounded-2xl" />
        <div className="h-36 bg-ink/8 rounded-2xl" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="space-y-4">
        <div className="p-4 bg-brick/10 border-l-4 border-brick rounded-xl text-sm text-brick">
          {error || "Task not found."}
        </div>
        <Link
          href="/maintenance"
          className="text-sm text-ink/60 hover:text-ink inline-flex items-center gap-1.5"
        >
          <ArrowLeft size={14} />
          <span>Back to work list</span>
        </Link>
      </div>
    );
  }

  const canStartWork = incident.status === "assigned";
  const canSubmitResolution = incident.status === "in_progress";
  const isWaitingReview =
    incident.status === "resolution_submitted" ||
    incident.status === "evidence_checked";
  const isComplete =
    incident.status === "resolved" || incident.status === "closed";

  return (
    <div className="space-y-6 pb-20">
      <Link
        href="/maintenance"
        className="text-xs text-ink/55 hover:text-ink inline-flex items-center gap-1.5 transition-colors"
      >
        <ArrowLeft size={14} />
        <span>Back to work list</span>
      </Link>

      {/* Header */}
      <div className="space-y-2.5">
        <div className="flex items-center gap-2 flex-wrap">
          {incident.severity && (
            <SeverityIndicator severity={incident.severity} />
          )}
          {incident.categoryName && (
            <span className="text-[11px] font-medium text-ink/65 bg-ink/5 px-2.5 py-0.5 rounded-full">
              {incident.categoryName}
            </span>
          )}
          <span className="text-[11px] font-mono text-ink/40">
            #{incident.id.slice(0, 8)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-ink bg-ink/[0.05] px-3 py-1.5 rounded-xl">
            {STATUS_LABELS[incident.status] || incident.status}
          </span>
          {incident.hoursRemaining !== null && !isComplete && (
            <span
              className={`inline-flex items-center gap-1 text-xs font-medium px-3 py-1 rounded-full tabular-nums ${
                incident.isOverdue
                  ? "bg-brick/10 text-brick"
                  : incident.hoursRemaining < 2
                    ? "bg-marigold/10 text-marigold"
                    : "bg-pine/10 text-pine"
              }`}
            >
              {incident.isOverdue ? (
                <AlertTriangle size={12} />
              ) : (
                <Clock size={12} />
              )}
              <span>
                {incident.isOverdue
                  ? `${Math.abs(incident.hoursRemaining).toFixed(1)}h overdue`
                  : `${incident.hoursRemaining.toFixed(1)}h remaining`}
              </span>
            </span>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="rounded-2xl p-5 border border-ink/10 bg-paper space-y-2 shadow-soft">
        <div className="text-xs font-medium text-ink/55">Description</div>
        <p className="text-sm text-ink leading-relaxed">
          {incident.description || "No description provided."}
        </p>
        {incident.teamName && (
          <p className="text-xs text-ink/50 pt-1">Team: {incident.teamName}</p>
        )}
      </div>

      {/* Resident reports & photos */}
      {issues.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-ink/60">
            Resident Reports ({issues.length})
          </div>
          {issues.map((issue) => (
            <div
              key={issue.id}
              className="rounded-2xl p-4 border border-ink/10 bg-paper space-y-3 shadow-soft"
            >
              {issue.rawText && (
                <p className="text-sm text-ink leading-relaxed">
                  {issue.rawText}
                </p>
              )}
              {issue.photoPaths.length > 0 && (
                <div className="flex gap-2.5 overflow-x-auto pb-1">
                  {issue.photoPaths.map((_, i) => {
                    const url = issue.photoUrls?.[i];
                    return url ? (
                      <a
                        key={i}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 rounded-xl overflow-hidden border border-ink/10 hover:opacity-90 transition-opacity"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Issue photo ${i + 1}`}
                          className="w-24 h-24 object-cover"
                        />
                      </a>
                    ) : (
                      <div
                        key={i}
                        className="w-24 h-24 rounded-xl bg-ink/5 border border-ink/10 shrink-0 flex items-center justify-center text-[11px] text-ink/35 text-center p-2"
                      >
                        Photo unavailable
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="text-[11px] text-ink/45">
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
        <div className="p-3.5 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          {actionError}
        </div>
      )}
      {actionSuccess && (
        <div className="p-3.5 bg-pine/10 border-l-4 border-pine rounded-xl text-xs text-pine font-medium">
          {actionSuccess}
        </div>
      )}

      {/* Actions */}
      {canStartWork && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() =>
              handleTransition("in_progress", "Staff started work on-site.")
            }
            disabled={actionLoading}
            className="w-full py-3.5 bg-pine text-on-pine font-semibold text-sm rounded-xl hover:bg-pine/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2 shadow-soft"
          >
            {actionLoading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Starting…</span>
              </>
            ) : (
              <span>Start Work</span>
            )}
          </button>
          <p className="text-xs text-ink/45 text-center">
            Tap when you arrive on-site and begin the repair.
          </p>
        </div>
      )}

      {canSubmitResolution && !showResolutionForm && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowResolutionForm(true)}
            className="w-full py-3.5 bg-pine text-on-pine font-semibold text-sm rounded-xl hover:bg-pine/90 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-soft"
          >
            <Camera size={16} />
            <span>Submit Resolution</span>
          </button>
          <p className="text-xs text-ink/45 text-center">
            Take a photo of the completed work for committee review.
          </p>
        </div>
      )}

      {/* Resolution form */}
      {canSubmitResolution && showResolutionForm && (
        <div className="rounded-2xl p-5 border border-pine/25 bg-pine/[0.04] space-y-4 shadow-soft">
          <div className="text-sm font-semibold text-ink">
            Submit Resolution Proof
          </div>

          <div className="space-y-2">
            <label className="text-xs font-medium text-ink/75 block">
              After Photo <span className="text-brick">*</span>
            </label>
            {photoPreview ? (
              <div className="relative rounded-xl overflow-hidden border border-ink/10">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoPreview}
                  alt="Resolution photo preview"
                  className="w-full h-48 object-cover"
                />
                <button
                  type="button"
                  onClick={clearPhoto}
                  className="absolute top-2.5 right-2.5 w-8 h-8 rounded-lg bg-ink/80 text-paper flex items-center justify-center hover:bg-ink transition-colors"
                  aria-label="Remove photo"
                >
                  <X size={15} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-8 rounded-xl border border-dashed border-ink/25 bg-paper text-ink/60 text-sm hover:border-marigold hover:text-ink transition-colors flex flex-col items-center gap-2"
              >
                <Camera size={22} className="text-ink/40" />
                <span>Tap to take or select photo</span>
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

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-ink/75 block">
              Work note (optional)
            </label>
            <textarea
              value={resolutionNote}
              onChange={(e) => setResolutionNote(e.target.value)}
              placeholder="Describe what was fixed or replaced…"
              rows={3}
              maxLength={1000}
              className="w-full p-3 rounded-xl border border-ink/15 bg-paper text-sm text-ink placeholder:text-ink/35 focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15 resize-none"
            />
          </div>

          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={handleSubmitResolution}
              disabled={actionLoading || !resolutionPhoto}
              className="flex-1 py-3 bg-pine text-on-pine font-semibold text-sm rounded-xl hover:bg-pine/90 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {actionLoading ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Submit Proof</span>
              )}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowResolutionForm(false);
                clearPhoto();
                setResolutionNote("");
              }}
              disabled={actionLoading}
              className="px-4 py-3 rounded-xl border border-ink/15 text-ink/65 text-sm font-medium hover:bg-ink/5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Waiting for review banner */}
      {isWaitingReview && (
        <div className="rounded-xl p-4 bg-marigold/10 border-l-4 border-marigold space-y-1.5">
          <div className="text-sm font-semibold text-marigold flex items-center gap-1.5">
            <Clock size={15} />
            <span>Awaiting Committee Review</span>
          </div>
          <p className="text-xs text-ink/65 leading-relaxed">
            Your resolution proof has been submitted. The society committee will
            verify the photo and approve it.
          </p>
          {incident.evidenceAiCheck && (
            <p className="text-xs text-ink/60 pt-1 flex items-center gap-1.5">
              <Sparkles size={12} className="text-marigold" />
              <span>
                Visual check:{" "}
                {incident.evidenceAiCheck.consistent
                  ? "Evidence looks consistent"
                  : "Needs manual review"}{" "}
                ({Math.round(incident.evidenceAiCheck.confidence * 100)}%)
              </span>
            </p>
          )}
        </div>
      )}

      {/* Completed banner */}
      {isComplete && (
        <div className="rounded-xl p-4 bg-pine/10 border-l-4 border-pine space-y-1">
          <div className="text-sm font-semibold text-pine flex items-center gap-1.5">
            <CheckCircle2 size={15} />
            <span>{incident.status === "closed" ? "Closed" : "Resolved"}</span>
          </div>
          {incident.resolvedAt && (
            <p className="text-xs text-ink/60">
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

      {/* Timeline */}
      {timeline.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-ink/60">Activity log</div>
          <div className="rounded-2xl border border-ink/8 bg-paper p-4 space-y-0">
            {timeline.map((entry, i) => (
              <div key={entry.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <Circle
                    size={8}
                    className={`mt-1.5 shrink-0 ${
                      i === timeline.length - 1
                        ? "text-pine fill-pine"
                        : "text-ink/20 fill-ink/20"
                    }`}
                  />
                  {i < timeline.length - 1 && (
                    <div className="w-px flex-1 bg-ink/10 min-h-[24px] my-1" />
                  )}
                </div>
                <div className="pb-3.5 min-w-0">
                  <div className="text-xs font-medium text-ink">
                    {entry.fromStatus
                      ? `${STATUS_LABELS[entry.fromStatus] || entry.fromStatus} → ${STATUS_LABELS[entry.toStatus] || entry.toStatus}`
                      : STATUS_LABELS[entry.toStatus] || entry.toStatus}
                  </div>
                  {entry.note && (
                    <p className="text-[11px] text-ink/60 mt-0.5 break-words leading-relaxed">
                      {entry.note}
                    </p>
                  )}
                  <div className="text-[10px] text-ink/40 mt-0.5 tabular-nums">
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
