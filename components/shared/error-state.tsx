// Error State — clean error display with retry option.

import React from "react";
import { CircleAlert } from "@/components/shared/icons";

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
      className={`bg-brick/5 border border-brick/15 rounded-xl p-5 ${className}`}
      role="alert"
    >
      <div className="flex items-start gap-3">
        <CircleAlert size={18} className="text-brick shrink-0 mt-0.5" />
        <div className="flex-1">
          <p className="text-sm font-medium text-brick">{message}</p>
          {recoveryHint && (
            <p className="mt-1 text-xs text-ink/60">{recoveryHint}</p>
          )}
          {onRetry && (
            <div className="mt-3">
              <button
                type="button"
                onClick={onRetry}
                className="px-4 py-2 text-xs font-medium bg-brick text-on-brick rounded-lg hover:bg-brick/90 transition-all active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brick"
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
