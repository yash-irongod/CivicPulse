// Star Rating Feedback Component.
// Replaces the binary confirm/dispute with a 1–5 star rating + comment.
// ≥ 4 stars → auto-closes. ≤ 3 stars → escalates to admin.

"use client";

import React, { useState } from "react";

interface FeedbackConfirmProps {
  incidentId: string;
  incidentTitle?: string;
  onComplete: () => void;
  onCancel?: () => void;
}

function StarButton({
  filled,
  hovered,
  onClick,
  onHover,
  index,
}: {
  filled: boolean;
  hovered: boolean;
  onClick: () => void;
  onHover: () => void;
  index: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className={`text-3xl sm:text-4xl transition-all duration-150 ${
        filled || hovered
          ? "text-marigold scale-110"
          : "text-ink/20 hover:text-marigold/50"
      }`}
      aria-label={`Rate ${index + 1} star${index > 0 ? "s" : ""}`}
    >
      {filled ? "★" : "☆"}
    </button>
  );
}

const RATING_LABELS: Record<number, { text: string; color: string }> = {
  1: { text: "Very poor — issue not addressed", color: "text-brick" },
  2: { text: "Poor — partially done", color: "text-brick" },
  3: { text: "Average — some issues remain", color: "text-marigold" },
  4: { text: "Good — well done", color: "text-pine" },
  5: { text: "Excellent — perfect job!", color: "text-pine" },
};

export function FeedbackConfirm({
  incidentId,
  incidentTitle,
  onComplete,
  onCancel,
}: FeedbackConfirmProps) {
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const displayRating = hoveredStar || rating;
  const ratingInfo = displayRating > 0 ? RATING_LABELS[displayRating] : null;
  const isLowRating = rating > 0 && rating <= 3;

  const handleSubmit = async () => {
    if (rating === 0) {
      setError("Please select a rating.");
      return;
    }

    if (isLowRating && (!comment || comment.trim().length === 0)) {
      setError("Please describe what went wrong so the admin can review.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/incidents/${incidentId}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rating,
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
    <div className="border-2 border-ink/30 p-5 bg-paper space-y-4 shadow-md">
      {/* Header */}
      <div className="border-b border-ink/10 pb-3">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-ink/60 uppercase tracking-widest font-bold">
            Rate the Work · #{incidentId.slice(0, 8)}
          </span>
          <span className="text-[10px] text-marigold bg-marigold/10 px-2 py-0.5 border border-marigold/20 font-bold uppercase">
            Your Feedback
          </span>
        </div>
        <h3 className="text-base font-bold text-ink mt-1">
          How was the maintenance work?
        </h3>
        {incidentTitle && (
          <p className="text-xs text-ink/75 mt-0.5 italic">
            &ldquo;{incidentTitle}&rdquo;
          </p>
        )}
      </div>

      {/* Star Rating */}
      <div className="flex flex-col items-center gap-2 py-2">
        <div className="flex gap-1" onMouseLeave={() => setHoveredStar(0)}>
          {[1, 2, 3, 4, 5].map((star) => (
            <StarButton
              key={star}
              index={star - 1}
              filled={star <= rating}
              hovered={star <= hoveredStar && star > rating}
              onClick={() => {
                setRating(star);
                setError(null);
              }}
              onHover={() => setHoveredStar(star)}
            />
          ))}
        </div>

        {ratingInfo && (
          <span
            className={`text-xs font-semibold ${ratingInfo.color} transition-all`}
          >
            {ratingInfo.text}
          </span>
        )}
      </div>

      {/* Comment box — always shown but required for low ratings */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold text-ink/70 block">
          {isLowRating
            ? "What went wrong? (required for low ratings)"
            : "Any comments? (optional)"}
        </label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            isLowRating
              ? "Please describe the issue so the admin can review and take action..."
              : "Leave a comment about the work quality..."
          }
          rows={3}
          className="w-full text-xs p-3 bg-paper border border-ink/30 text-ink focus:outline-none focus:border-marigold"
        />
      </div>

      {/* Info about what happens */}
      {rating > 0 && (
        <div
          className={`text-[11px] p-2.5 border-l-2 ${
            isLowRating
              ? "bg-marigold/5 border-l-marigold text-marigold"
              : "bg-pine/5 border-l-pine text-pine"
          }`}
        >
          {isLowRating
            ? "This rating will escalate the issue to the society admin for review. They will decide whether to reopen the ticket for rework."
            : "This will close the ticket. Thank you for your feedback!"}
        </div>
      )}

      {error && (
        <div className="p-2.5 bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
          {error}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          disabled={rating === 0 || isSubmitting}
          onClick={handleSubmit}
          className={`flex-1 py-3 px-4 font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-40 shadow-sm ${
            isLowRating
              ? "bg-marigold text-on-marigold hover:bg-marigold/90"
              : rating > 0
                ? "bg-pine text-on-pine hover:bg-pine/90"
                : "bg-ink/20 text-ink/50"
          }`}
        >
          {isSubmitting
            ? "Submitting..."
            : rating === 0
              ? "Select a rating above"
              : isLowRating
                ? "Submit & Escalate to Admin"
                : "Submit & Close Ticket"}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 text-xs text-ink/60 hover:text-ink uppercase tracking-wider"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
