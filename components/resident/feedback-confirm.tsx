// Star Rating Feedback Component.
// 1–5 star rating + comment. >= 4 stars auto-closes; <= 3 stars escalates to committee admin.

"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { Star, Info, CircleAlert, Loader2 } from "@/components/shared/icons";

interface FeedbackConfirmProps {
  incidentId: string;
  incidentTitle?: string;
  onComplete: () => void;
  onCancel?: () => void;
}

function StarButton({
  active,
  onClick,
  onHover,
  index,
}: {
  active: boolean;
  onClick: () => void;
  onHover: () => void;
  index: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      whileTap={{ scale: 0.88 }}
      whileHover={{ scale: 1.12 }}
      transition={{ type: "spring", stiffness: 420, damping: 24 }}
      className={`p-1.5 rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-marigold ${
        active ? "text-marigold" : "text-ink/20 hover:text-marigold/55"
      }`}
      aria-label={`Rate ${index + 1} star${index > 0 ? "s" : ""}`}
    >
      <Star
        size={30}
        strokeWidth={1.8}
        className={active ? "fill-marigold" : "fill-transparent"}
      />
    </motion.button>
  );
}

const RATING_LABELS: Record<number, { text: string; color: string }> = {
  1: { text: "Very poor — issue not addressed", color: "text-brick" },
  2: { text: "Poor — partially done", color: "text-brick" },
  3: { text: "Average — some issues remain", color: "text-marigold" },
  4: { text: "Good — well done", color: "text-pine" },
  5: { text: "Excellent — perfect job", color: "text-pine" },
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
      setError("Please select a star rating.");
      return;
    }

    if (isLowRating && (!comment || comment.trim().length === 0)) {
      setError("Please describe what went wrong so the committee can review.");
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
    <div className="rounded-2xl border border-ink/12 p-5 sm:p-6 bg-paper space-y-4 shadow-card">
      {/* Header */}
      <div className="border-b border-ink/8 pb-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-ink/50 font-medium">
            Ticket <span className="font-mono">#{incidentId.slice(0, 8)}</span>
          </span>
          <span className="text-[11px] text-marigold bg-marigold/10 px-2.5 py-0.5 rounded-full font-medium">
            Your Feedback
          </span>
        </div>
        <h3 className="text-base font-semibold text-ink mt-1.5">
          How was the maintenance work?
        </h3>
        {incidentTitle && (
          <p className="text-xs text-ink/60 mt-1 line-clamp-2">
            &ldquo;{incidentTitle}&rdquo;
          </p>
        )}
      </div>

      {/* Star Rating */}
      <div className="flex flex-col items-center gap-2 py-2">
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHoveredStar(0)}
        >
          {[1, 2, 3, 4, 5].map((star) => (
            <StarButton
              key={star}
              index={star - 1}
              active={star <= displayRating}
              onClick={() => {
                setRating(star);
                setError(null);
              }}
              onHover={() => setHoveredStar(star)}
            />
          ))}
        </div>

        <div className="h-5 flex items-center">
          {ratingInfo ? (
            <span className={`text-xs font-medium ${ratingInfo.color}`}>
              {ratingInfo.text}
            </span>
          ) : (
            <span className="text-xs text-ink/40">Tap a star to rate</span>
          )}
        </div>
      </div>

      {/* Comment box */}
      <div className="space-y-1.5">
        <label
          htmlFor={`feedback-comment-${incidentId}`}
          className="text-xs font-medium text-ink/70 block"
        >
          {isLowRating
            ? "What went wrong? (required for 1–3 stars)"
            : "Additional comments (optional)"}
        </label>
        <textarea
          id={`feedback-comment-${incidentId}`}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={
            isLowRating
              ? "Describe what still needs attention so the committee can follow up..."
              : "Share a brief note about the repair quality..."
          }
          rows={3}
          className="w-full text-sm p-3 bg-paper border border-ink/15 rounded-xl text-ink placeholder:text-ink/35 focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15 transition-all"
        />
      </div>

      {/* Outcome preview */}
      {rating > 0 && (
        <div
          className={`flex items-start gap-2.5 text-xs p-3 rounded-xl border ${
            isLowRating
              ? "bg-marigold/[0.06] border-marigold/20 text-marigold"
              : "bg-pine/[0.06] border-pine/20 text-pine"
          }`}
        >
          <Info size={15} className="shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            {isLowRating
              ? "This rating will escalate the ticket to the society committee for review and possible rework."
              : "This rating will confirm and close the ticket. Thank you for verifying!"}
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={15} className="shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2.5 pt-1">
        <button
          type="button"
          disabled={rating === 0 || isSubmitting}
          onClick={handleSubmit}
          className={`flex-1 py-3 px-4 font-semibold text-sm rounded-xl transition-all active:scale-[0.98] disabled:opacity-45 flex items-center justify-center gap-2 ${
            isLowRating
              ? "bg-marigold text-on-marigold hover:bg-marigold/90"
              : rating > 0
                ? "bg-pine text-on-pine hover:bg-pine/90"
                : "bg-ink/15 text-ink/50"
          }`}
        >
          {isSubmitting ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              <span>Submitting…</span>
            </>
          ) : rating === 0 ? (
            "Select a rating above"
          ) : isLowRating ? (
            "Submit & Escalate"
          ) : (
            "Submit & Close Ticket"
          )}
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-3 text-sm font-medium text-ink/60 hover:text-ink rounded-xl hover:bg-ink/5 transition-colors"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  );
}
