"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { logEvent } from "@/lib/auth/log";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logEvent("error", "app_error_boundary_triggered", {
      errorMessage: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink">
      <div className="max-w-md w-full">
        <ErrorState
          message="An unexpected error occurred while rendering this screen."
          recoveryHint="Please check your connection and reload the screen. Ongoing drafts are preserved locally."
          onRetry={reset}
          retryLabel="Retry"
        />
      </div>
    </div>
  );
}
