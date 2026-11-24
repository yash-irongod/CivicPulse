// Dashboard Skeleton — shimmer loading state for the admin dashboard.

import React from "react";

export function DashboardSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="space-y-2">
        <div className="h-4 bg-ink/6 w-24 rounded-lg" />
        <div className="h-7 bg-ink/8 w-48 rounded-lg" />
      </div>
      <div className="flex items-end gap-4">
        <div className="h-20 w-28 bg-ink/6 rounded-lg" />
        <div className="h-6 w-16 bg-ink/4 rounded-lg mb-2" />
      </div>
      <div className="flex gap-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 w-24 bg-ink/6 rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="border border-ink/6 rounded-xl p-5 space-y-3">
            <div className="h-3 bg-ink/6 w-24 rounded" />
            <div className="h-5 bg-ink/8 w-16 rounded" />
            <div className="h-1.5 bg-ink/6 rounded-full w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
