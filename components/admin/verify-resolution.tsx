// Resolution Verification — before/after photo comparison with admin actions.
// Clean card design, modern buttons, no jargon.

"use client";

import React, { useState } from "react";
import { CheckCircle2, X, Sparkles } from "@/components/shared/icons";

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
  beforePhotoUrl?: string | null;
  afterPhotoUrl?: string | null;
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
  const confidenceScore =
    aiCheck?.confidence !== undefined
      ? Math.round(aiCheck.confidence * 100)
      : null;

  return (
    <div className="border border-ink/10 bg-paper rounded-xl p-5 sm:p-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-ink/6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-xs text-ink/40">
            #{item.id.slice(0, 8)}
          </span>
          <span className="text-xs text-ink/60">
            Team:{" "}
            <strong className="text-ink/80">
              {item.teamName || "General"}
            </strong>
          </span>
          {item.severity && (
            <span
              className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                item.severity === "critical"
                  ? "bg-brick/10 text-brick"
                  : item.severity === "high"
                    ? "bg-marigold/10 text-marigold"
                    : "bg-pine/8 text-pine"
              }`}
            >
              {item.severity}
            </span>
          )}
        </div>
        <span className="text-xs font-medium text-marigold bg-marigold/8 px-3 py-1 rounded-full">
          Awaiting approval
        </span>
      </div>

      {/* Description */}
      <div>
        <h3 className="text-sm font-semibold text-ink">
          {item.description || "Reported Issue"}
        </h3>
        {item.resolutionNotes && (
          <div className="mt-2 text-sm text-ink/65 bg-ink/[0.02] p-3 border-l-2 border-l-pine rounded-r-lg">
            <span className="font-medium text-ink/50">Staff note:</span> &ldquo;
            {item.resolutionNotes}&rdquo;
          </div>
        )}
      </div>

      {/* Photos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Before */}
        <div className="border border-ink/8 bg-paper rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs pb-2 border-b border-ink/6">
            <span className="w-2 h-2 rounded-full bg-brick/60" />
            <span className="font-medium text-ink/60">Before</span>
          </div>
          {item.beforePhotoUrl ? (
            <a
              href={item.beforePhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.beforePhotoUrl}
                alt="Before — original issue photo"
                className="aspect-[4/3] w-full object-cover rounded-lg"
              />
            </a>
          ) : (
            <div className="aspect-[4/3] bg-ink/4 rounded-lg flex items-center justify-center text-sm text-ink/30">
              No photo
            </div>
          )}
        </div>

        {/* After */}
        <div className="border border-ink/8 bg-paper rounded-xl p-3 space-y-2">
          <div className="flex items-center gap-1.5 text-xs pb-2 border-b border-ink/6">
            <span className="w-2 h-2 rounded-full bg-pine" />
            <span className="font-medium text-ink/60">After</span>
          </div>
          {item.afterPhotoUrl ? (
            <a
              href={item.afterPhotoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.afterPhotoUrl}
                alt="After — staff proof of work"
                className="aspect-[4/3] w-full object-cover rounded-lg"
              />
            </a>
          ) : (
            <div className="aspect-[4/3] bg-pine/[0.04] rounded-lg flex items-center justify-center text-sm text-ink/30">
              No photo
            </div>
          )}
        </div>
      </div>

      {/* AI check */}
      <div className="bg-ink/[0.02] border border-ink/6 rounded-xl p-4 space-y-2">
        {confidenceScore !== null ? (
          <>
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <Sparkles size={14} className="text-pine" />
                <span className="font-medium text-ink">AI visual check</span>
              </div>
              <span className="text-pine font-semibold">
                {confidenceScore}% match
              </span>
            </div>
            {aiCheck?.reasoning && (
              <p className="text-xs text-ink/55 italic">
                &ldquo;{aiCheck.reasoning}&rdquo;
              </p>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 text-xs text-ink/50">
            <Sparkles size={14} className="text-ink/25" />
            <span>
              No automated inspection available — please review manually.
            </span>
          </div>
        )}
        <p className="text-[11px] text-ink/35">
          Committee approval is required before marking resolved.
        </p>
      </div>

      {error && (
        <div className="p-3 bg-brick/8 border border-brick/15 rounded-lg text-sm text-brick">
          {error}
        </div>
      )}

      {/* Actions */}
      {!showRejectForm ? (
        <div className="flex flex-wrap items-center gap-3 pt-1">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={handleApprove}
            className="flex-1 min-w-[200px] py-3 px-5 bg-pine text-on-pine text-sm font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              "Approving..."
            ) : (
              <>
                <CheckCircle2 size={16} />
                Approve & Resolve
              </>
            )}
          </button>
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowRejectForm(true)}
            className="py-3 px-5 border border-brick/30 text-brick text-sm font-semibold rounded-xl hover:bg-brick/5 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            <X size={16} />
            Request Rework
          </button>
        </div>
      ) : (
        <div className="space-y-3 pt-3 border-t border-ink/6">
          <label className="text-xs font-semibold text-brick block">
            Why is rework needed?
          </label>
          <div className="flex flex-wrap gap-1.5">
            {REJECTION_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setRejectNote(preset)}
                className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                  rejectNote === preset
                    ? "border-brick bg-brick/8 text-brick"
                    : "border-ink/10 text-ink/60 hover:border-brick/30 hover:text-brick"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <textarea
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Or type a custom reason..."
            rows={2}
            className="w-full text-sm p-3 bg-paper border border-ink/10 text-ink rounded-lg focus:outline-none focus:border-brick/50 focus:ring-2 focus:ring-brick/10"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleReject}
              className="py-2.5 px-5 bg-brick text-on-brick text-sm font-semibold rounded-lg hover:bg-brick/90 disabled:opacity-50 transition-all active:scale-[0.98]"
            >
              {isSubmitting ? "Sending..." : "Send Back to Staff"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowRejectForm(false);
                setError(null);
              }}
              className="py-2.5 px-4 text-sm text-ink/50 hover:text-ink font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
