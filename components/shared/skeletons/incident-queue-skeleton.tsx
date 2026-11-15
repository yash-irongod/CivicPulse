// Content-Aware Incident Queue Skeleton (Task 10.2, §7.6).
// Matches the real layout of the ops-room dense incident scanning rows.

import React from "react";

export function IncidentQueueSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div
      className="border border-ink/15 bg-paper divide-y divide-ink/10"
      aria-busy="true"
      aria-label="Loading incident queue"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="p-3.5 space-y-2 border-l-4 border-l-ink/10 animate-pulse"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-3 w-16 bg-ink/10" />
              <div className="h-3 w-20 bg-ink/10" />
              <div className="h-3 w-24 bg-ink/10" />
            </div>
            <div className="h-3 w-20 bg-ink/10" />
          </div>
          <div className="h-3.5 w-3/4 bg-ink/10" />
        </div>
      ))}
    </div>
  );
}
