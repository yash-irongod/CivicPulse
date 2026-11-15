// Feedback Confirmation Component (Task 8.4, §6.7, §7.4).
// High-tactility Citizen Verification module allowing residents to confirm resolution or dispute & reopen.

"use client";

import React, { useState } from "react";

interface FeedbackConfirmProps {
  incidentId: string;
  incidentTitle?: string;
  onComplete: () => void;
  onCancel?: () => void;
}

const REOPEN_CHIPS = [
  "Water / leak remains damp",
  "Debris or tools not cleared",
  "Fixture still malfunctioning",
  "Cosmetic finish incomplete",
  "Incorrect location addressed",
];

export function FeedbackConfirm({
  incidentId,
  incidentTitle,
  onComplete,
  onCancel,
}: FeedbackConfirmProps) {
  const [confirmed, setConfirmed] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (confirmed === null) return;

    if (!confirmed && (!comment || comment.trim().length === 0)) {
      setError("Please specify why the resolution is incomplete.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/incidents/${incidentId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmed,
          comment: comment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to submit feedback.");
      }

      onComplete();
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
      setIsSubmitting(false);
    }
  };

  return (
    <div className="border-2 border-ink/30 p-5 bg-paper space-y-4 reticle-box shadow-md animate-fadeIn">
      {/* Header */}
      <div className="border-b border-ink/10 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-mono text-ink/60 uppercase tracking-widest font-bold">
            CITIZEN VERIFICATION • #{incidentId.slice(0, 8)}
          </span>
          <span className="text-[10px] font-mono text-marigold bg-marigold/10 px-2 py-0.5 border border-marigold/20 font-bold uppercase">
            ACTION REQUIRED
          </span>
        </div>
        <h3 className="text-base font-bold text-ink mt-1 font-sans">
          Was this issue successfully resolved?
        </h3>
        {incidentTitle && (
          <p className="text-xs text-ink/75 mt-0.5 font-mono italic">
            &ldquo;{incidentTitle}&rdquo;
          </p>
        )}
      </div>

      {/* Dual Tactile Decision Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* YES OPTION */}
        <button
          type="button"
          onClick={() => {
            setConfirmed(true);
            setError(null);
          }}
          className={`p-3.5 border-2 text-left transition-all relative ${
            confirmed === true
              ? "bg-pine/10 border-pine text-ink shadow-sm"
              : "bg-paper border-ink/20 text-ink/80 hover:border-pine/60"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-pine">
              ✓ YES, FIXED
            </span>
            <span
              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                confirmed === true
                  ? "border-pine bg-pine text-on-pine text-[9px]"
                  : "border-ink/30"
              }`}
            >
              {confirmed === true ? "✓" : ""}
            </span>
          </div>
          <p className="text-[11px] text-ink/70 font-sans">
            Work completed to standard. Authorize ticket closure.
          </p>
        </button>

        {/* NO OPTION */}
        <button
          type="button"
          onClick={() => {
            setConfirmed(false);
            setError(null);
          }}
          className={`p-3.5 border-2 text-left transition-all relative ${
            confirmed === false
              ? "bg-brick/10 border-brick text-ink shadow-sm"
              : "bg-paper border-ink/20 text-ink/80 hover:border-brick/60"
          }`}
        >
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-bold uppercase tracking-wider font-mono text-brick">
              ✕ NO, STILL BROKEN
            </span>
            <span
              className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${
                confirmed === false
                  ? "border-brick bg-brick text-on-brick text-[9px]"
                  : "border-ink/30"
              }`}
            >
              {confirmed === false ? "✓" : ""}
            </span>
          </div>
          <p className="text-[11px] text-ink/70 font-sans">
            Issue persists or quality is poor. Reopen immediately.
          </p>
        </button>
      </div>

      {/* DISPUTE FORM (if confirmed === false) */}
      {confirmed === false && (
        <div className="space-y-2.5 pt-2 border-t border-ink/10 animate-fadeIn">
          <label className="text-xs font-bold font-mono text-brick block uppercase tracking-wider">
            WHAT REMAINS INCOMPLETE?
          </label>

          {/* Quick chips */}
          <div className="flex flex-wrap gap-1.5">
            {REOPEN_CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setComment(chip)}
                className="text-[10px] font-mono px-2 py-1 bg-ink/5 border border-ink/20 text-ink/80 hover:border-brick hover:text-brick transition-colors"
              >
                + {chip}
              </button>
            ))}
          </div>

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Describe the condition (e.g. water is still dripping from the joint)..."
            rows={3}
            className="w-full text-xs font-mono p-3 bg-paper border border-ink/30 text-ink focus:outline-none focus:border-brick"
          />
          <p className="text-[10px] font-mono text-ink/60">
            ⚠ Submitting will revert incident to assigned status and notify the
            squad supervisor.
          </p>
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-brick/10 border-l-4 border-brick text-xs text-brick font-mono">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={confirmed === null || isSubmitting}
          onClick={handleSubmit}
          className={`flex-1 py-3 px-4 font-bold text-xs font-mono uppercase tracking-wider transition-all disabled:opacity-40 shadow-sm ${
            confirmed === true
              ? "bg-pine text-on-pine hover:bg-pine/90"
              : confirmed === false
                ? "bg-brick text-on-brick hover:bg-brick/90"
                : "bg-ink text-paper"
          }`}
        >
          {isSubmitting
            ? "TRANSMITTING FEEDBACK..."
            : confirmed === true
              ? "CONFIRM RESOLUTION & CLOSE"
              : confirmed === false
                ? "REOPEN TICKET & NOTIFY SQUAD"
                : "SELECT AN OPTION ABOVE"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 text-xs font-mono text-ink/60 hover:text-ink uppercase tracking-wider"
          >
            CANCEL
          </button>
        )}
      </div>
    </div>
  );
}
