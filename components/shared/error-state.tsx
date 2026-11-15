// Error State (Task 10.2, §7.6).
// Explains what happened and how to recover in the interface's own voice, without apologizing.

import React from "react";

interface ErrorStateProps {
  message: string;
  recoveryHint?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export function ErrorState({
  message,
  recoveryHint,
  onRetry,
  retryLabel = "Try again",
  className = "",
}: ErrorStateProps) {
  return (
    <div
      className={`border-l-4 border-l-brick bg-paper border border-ink/10 p-6 text-left ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium text-brick">{message}</p>
          {recoveryHint && (
            <p className="mt-1 text-xs text-ink/80">{recoveryHint}</p>
          )}
          {onRetry && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onRetry}
                className="px-3 py-1 text-xs font-medium bg-brick text-on-brick hover:bg-brick/90 focus:outline-none focus:ring-2 focus:ring-brick"
              >
                {retryLabel}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
