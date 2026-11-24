// Timeline Skeleton — shimmer loading for the timeline stepper.

import React from "react";

export function TimelineSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-10 bg-ink/6 rounded-xl" />
      <div className="flex items-center justify-between px-1">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <div className="w-9 h-9 bg-ink/8 rounded-full" />
            <div className="h-3 w-10 bg-ink/6 rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
