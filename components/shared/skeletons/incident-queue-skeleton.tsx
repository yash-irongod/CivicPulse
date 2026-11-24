// Incident Queue Skeleton — shimmer loading for the incident list.

import React from "react";

interface IncidentQueueSkeletonProps {
  count?: number;
}

export function IncidentQueueSkeleton({
  count = 5,
}: IncidentQueueSkeletonProps) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="bg-paper border border-ink/6 rounded-xl p-4 space-y-2.5"
        >
          <div className="flex items-center gap-2">
            <div className="h-4 bg-ink/8 w-16 rounded" />
            <div className="h-4 bg-ink/6 w-20 rounded-full" />
            <div className="h-4 bg-ink/5 w-16 rounded-full" />
          </div>
          <div className="h-4 bg-ink/6 w-3/4 rounded" />
        </div>
      ))}
    </div>
  );
}
