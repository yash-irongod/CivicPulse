// Resolution Verification Component (Task 9.4, §5.4, §6.7, §7.4).
// Clean, elegant Before/After photo comparison for committee admins to verify staff work.

"use client";

import React, { useState } from "react";

export interface PendingVerification {
  id: string;
  description: string | null;
  status: string;
  severity: string | null;
  assignedTeamId: string | null;
  teamName: string | null;
  resolutionNotes: string | null;
  beforePhotoPath: string | null;
  afterPhotoPath: string | null;
  aiEvidenceCheck: {
    consistent?: boolean;
    confidence?: number;
    reasoning?: string;
  } | null;
  createdAt: string;
}

interface VerifyResolutionProps {
  item: PendingVerification;
  onProcessed: () => void;
}

const REJECTION_PRESETS = [
  "Water/leakage residue still visible",
  "Debris or tools not cleared from site",
  "Work incomplete according to society standards",
  "Incorrect location or fixture addressed",
  "Temporary patch applied; permanent fix required",
];

export function VerifyResolution({ item, onProcessed }: VerifyResolutionProps) {
  const [rejectNote, setRejectNote] = useState("");
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleApprove = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${item.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: "resolved",
          note: "Resolution evidence approved by society committee.",
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to approve resolution.");
      }

      onProcessed();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error approving resolution.",
      );
      setIsSubmitting(false);
    }
  };

  const handleReject = async () => {
    if (!rejectNote.trim()) {
      setError("Please specify why this resolution is being sent back.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/incidents/${item.id}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toStatus: "assigned",
          note: `Resolution rejected: ${rejectNote.trim()}`,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to send back resolution.");
      }

      onProcessed();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Error rejecting resolution.",
      );
      setIsSubmitting(false);
    }
  };

  const aiCheck = item.aiEvidenceCheck;
  // Only show a confidence score if the AI actually ran — never fabricate one.
  const confidenceScore =
    aiCheck?.confidence !== undefined
      ? Math.round(aiCheck.confidence * 100)
      : null;

  return (
    <div className="border border-ink/20 bg-paper p-5 sm:p-6 shadow-sm space-y-4">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 pb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-semibold px-2 py-0.5 bg-ink/5 border border-ink/15 text-ink">
            Ticket #{item.id.slice(0, 8)}
          </span>
          <span className="text-xs text-ink/70">
            Team: <strong>{item.teamName || "General Staff"}</strong>
          </span>
          {item.severity && (
            <span
              className={`text-[10px] font-semibold uppercase px-2 py-0.5 ${
                item.severity === "critical"
                  ? "bg-brick text-on-brick"
                  : item.severity === "high"
                    ? "bg-marigold text-on-marigold"
                    : "bg-pine text-on-pine"
              }`}
            >
              {item.severity}
            </span>
          )}
        </div>

        <span className="text-xs font-semibold text-marigold bg-marigold/10 px-2 py-0.5 border border-marigold/20">
          Awaiting Committee Approval
        </span>
      </div>

      {/* Incident Description */}
      <div>
        <h3 className="text-sm font-bold text-ink leading-snug">
          {item.description || "Reported Issue"}
        </h3>
        {item.resolutionNotes && (
          <div className="mt-2 text-xs text-ink/80 bg-ink/[0.02] p-3 border-l-2 border-l-pine border border-ink/10">
            <strong>Staff Completion Note:</strong> &ldquo;
            {item.resolutionNotes}&rdquo;
          </div>
        )}
      </div>

      {/* Side-by-Side Photos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* BEFORE */}
        <div className="border border-ink/15 bg-paper p-3 space-y-2">
          <div className="flex items-center justify-between text-xs border-b border-ink/10 pb-1.5">
            <span className="font-semibold text-brick flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-brick" />
              Before (Original Report)
            </span>
          </div>

          <div className="aspect-[4/3] bg-ink/5 border border-ink/10 flex flex-col items-center justify-center p-3 text-center">
            <span className="text-2xl mb-1">📷</span>
            <div className="font-mono text-xs text-ink/70 max-w-[90%] break-all">
              {item.beforePhotoPath || "Original Issue Photo"}
            </div>
            <span className="text-[10px] text-ink/50 mt-1">
              Reported by Resident
            </span>
          </div>
        </div>

        {/* AFTER */}
        <div className="border border-ink/15 bg-paper p-3 space-y-2">
          <div className="flex items-center justify-between text-xs border-b border-ink/10 pb-1.5">
            <span className="font-semibold text-pine flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-pine" />
              After (Staff Proof of Work)
            </span>
          </div>

          <div className="aspect-[4/3] bg-pine/[0.04] border border-pine/20 flex flex-col items-center justify-center p-3 text-center">
            <span className="text-2xl mb-1">✅</span>
            <div className="font-mono text-xs text-pine font-medium max-w-[90%] break-all">
              {item.afterPhotoPath || "Resolution Evidence Uploaded"}
            </div>
            <span className="text-[10px] text-pine/70 mt-1">
              Uploaded by Staff
            </span>
          </div>
        </div>
      </div>

      {/* AI Assistance Summary */}
      {confidenceScore !== null ? (
        <div className="border border-ink/15 bg-ink/[0.02] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-pine" />
              <strong className="text-ink">AI Visual Inspection</strong>
            </div>
            <span className="text-xs text-pine font-semibold">
              {confidenceScore}% Confidence Match
            </span>
          </div>

          {aiCheck?.reasoning && (
            <p className="text-xs text-ink/80 italic font-sans">
              &ldquo;{aiCheck.reasoning}&rdquo;
            </p>
          )}

          <span className="text-[11px] text-ink/50 block">
            * Committee approval is required before the ticket is marked
            resolved.
          </span>
        </div>
      ) : (
        <div className="border border-ink/15 bg-ink/[0.02] p-4 space-y-2">
          <div className="flex items-center gap-2 text-xs">
            <span className="w-2 h-2 rounded-full bg-ink/30" />
            <strong className="text-ink/70">
              No automated visual inspection available
            </strong>
          </div>
          <span className="text-[11px] text-ink/50 block">
            Please review the before/after evidence manually. Committee approval
            is required before the ticket is marked resolved.
          </span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
          {error}
        </div>
      )}

      {/* Decision Actions */}
      {!showRejectForm ? (
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleApprove}
            className="flex-1 min-w-[200px] py-3 px-5 bg-pine text-on-pine text-xs font-bold tracking-wide hover:bg-pine/90 disabled:opacity-50 transition-all shadow-sm flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <span>Approving...</span>
            ) : (
              <>
                <span>✓</span>
                <span>Approve & Mark Resolved</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowRejectForm(true)}
            className="py-3 px-5 border-2 border-brick text-brick text-xs font-bold tracking-wide hover:bg-brick/5 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <span>✕</span>
            <span>Request Rework</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 pt-3 border-t border-ink/15">
          <label className="text-xs font-bold text-brick block">
            Why is rework required? (Sent directly to the staff):
          </label>

          {/* Quick preset chips */}
          <div className="flex flex-wrap gap-1.5">
            {REJECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRejectNote(preset)}
                className="text-xs px-2.5 py-1 bg-ink/5 border border-ink/15 text-ink/80 hover:border-brick hover:text-brick text-left transition-colors"
              >
                + {preset}
              </button>
            ))}
          </div>

          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="e.g. Surface remains wet; second inspection needed..."
            rows={2}
            className="w-full text-xs p-3 bg-paper border border-ink/30 text-ink focus:outline-none focus:border-brick"
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleReject}
              className="py-2.5 px-5 bg-brick text-on-brick text-xs font-bold tracking-wide hover:bg-brick/90 disabled:opacity-50 transition-all shadow-sm"
            >
              {isSubmitting ? "Sending..." : "Confirm & Send Back to Staff"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setError(null);
              }}
              className="py-2.5 px-4 text-xs text-ink/70 hover:text-ink font-medium"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
