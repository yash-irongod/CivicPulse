// Content-Aware Community Health Dashboard Skeleton (Task 10.2, §7.6).
// Matches the hero number + 4-column metric breakdown layout.

import React from "react";

export function DashboardSkeleton() {
  return (
    <div
      className="space-y-12 max-w-5xl animate-pulse"
      aria-busy="true"
      aria-label="Loading operations dashboard"
    >
      {/* Greeting skeleton */}
      <div className="space-y-2">
        <div className="h-3 w-40 bg-ink/10" />
        <div className="h-6 w-64 bg-ink/10" />
      </div>

      {/* Hero Display number skeleton */}
      <div className="py-2 space-y-4">
        <div className="h-28 w-48 bg-ink/10" />
        <div className="flex gap-4">
          <div className="h-4 w-24 bg-ink/10" />
          <div className="h-4 w-24 bg-ink/10" />
          <div className="h-4 w-28 bg-ink/10" />
        </div>
      </div>

      {/* 4-column breakdown skeleton */}
      <div className="border-t border-ink/15 pt-8 space-y-4">
        <div className="h-4 w-48 bg-ink/10" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="border border-ink/15 p-4 bg-paper space-y-2"
            >
              <div className="h-3 w-28 bg-ink/10" />
              <div className="h-6 w-16 bg-ink/10" />
              <div className="h-2.5 w-32 bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
