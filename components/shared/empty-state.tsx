// Empty State (Task 10.2, §7.6).
// Follows written-voice rule: names what is actually empty and in what scope.
// Never uses generic illustrations, celebratory copy, or vague platitudes.

import React from "react";

interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`border border-ink/10 bg-paper p-8 text-left ${className}`}
      role="status"
    >
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 text-xs text-ink/70 max-w-md">{description}</p>
      )}
      {actionLabel && onAction && (
        <div className="mt-4">
          <button
            type="button"
            onClick={onAction}
            className="inline-flex items-center px-3 py-1.5 text-xs font-medium bg-ink text-paper hover:bg-ink/90 active:bg-ink focus:outline-none focus:ring-2 focus:ring-marigold"
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}
