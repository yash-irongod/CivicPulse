"use client";

import { useEffect } from "react";
import { ErrorState } from "@/components/shared/error-state";
import { logEvent } from "@/lib/auth/log";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logEvent("error", "global_error_boundary_triggered", {
      errorMessage: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-paper flex items-center justify-center p-6 text-ink antialiased">
        <div className="max-w-md w-full">
          <ErrorState
            message="Application encountered a critical error."
            recoveryHint="The system has safely intercepted the failure. Try refreshing the application."
            onRetry={reset}
            retryLabel="Reload application"
          />
        </div>
      </body>
    </html>
  );
}
