// Content-Aware Incident Timeline Skeleton (Task 10.2, §7.6).
// Matches the resident milestone stepper layout.

import React from "react";

export function TimelineSkeleton() {
  return (
    <div
      className="space-y-4 pt-2 animate-pulse"
      aria-busy="true"
      aria-label="Loading incident timeline"
    >
      <div className="flex items-center justify-between px-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <div className="w-3.5 h-3.5 rounded-full bg-ink/15" />
            <div className="h-2 w-10 bg-ink/10" />
          </div>
        ))}
      </div>
      <div className="border-t border-ink/10 pt-3 space-y-2">
        <div className="h-3 w-20 bg-ink/10" />
        <div className="h-4 w-3/4 bg-ink/10" />
      </div>
    </div>
  );
}
