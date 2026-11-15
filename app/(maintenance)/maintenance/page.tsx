// Maintenance Staff — Assigned Work List.
// Shows all incidents assigned to the staff member's team(s),
// sorted by urgency (overdue first, then closest SLA deadline).

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";

interface AssignedJob {
  id: string;
  description: string | null;
  status: string;
  severity: string | null;
  teamName: string | null;
  categoryName: string | null;
  slaTargetAt: string | null;
  hoursRemaining: number | null;
  isOverdue: boolean;
  createdAt: string;
}

const STATUS_LABELS: Record<string, string> = {
  assigned: "Assigned to You",
  in_progress: "In Progress",
  resolution_submitted: "Awaiting Review",
  evidence_checked: "Evidence Reviewed",
};

export default function MaintenanceWorklistPage() {
  const [jobs, setJobs] = useState<AssignedJob[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchJobs() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/maintenance/jobs");
        if (!res.ok) throw new Error("Failed to load your work assignments.");
        const data = await res.json();
        setJobs(data.jobs || []);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Error loading work.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchJobs();
  }, []);

  const activeJobs = jobs.filter(
    (j) =>
      j.status !== "resolution_submitted" && j.status !== "evidence_checked",
  );
  const pendingReviewJobs = jobs.filter(
    (j) =>
      j.status === "resolution_submitted" || j.status === "evidence_checked",
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-6 bg-ink/10 w-1/3 animate-pulse rounded" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-4 border border-ink/10 bg-paper space-y-2 animate-pulse"
          >
            <div className="h-4 bg-ink/10 w-2/3 rounded" />
            <div className="h-3 bg-ink/10 w-1/2 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-ink tracking-tight">
          Assigned Work
        </h1>
        <p className="text-xs text-ink/60 mt-0.5">
          {jobs.length === 0
            ? "No assignments right now."
            : `${activeJobs.length} active · ${pendingReviewJobs.length} awaiting review`}
        </p>
      </div>

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
          {error}
        </div>
      )}

      {jobs.length === 0 && !error && (
        <div className="text-center py-12 space-y-3">
          <div className="text-4xl text-ink/20">✓</div>
          <p className="text-sm text-ink/60">
            No work assigned to you right now.
          </p>
          <p className="text-xs text-ink/40">
            New assignments will appear here when the committee assigns work to
            your team.
          </p>
        </div>
      )}

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-ink/60 uppercase tracking-wider">
            Active
          </h2>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* Pending review */}
      {pendingReviewJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-ink/60 uppercase tracking-wider">
            Submitted — Awaiting Committee Review
          </h2>
          {pendingReviewJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}
    </div>
  );
}

function JobCard({ job }: { job: AssignedJob }) {
  const statusLabel = STATUS_LABELS[job.status] || job.status;

  return (
    <Link
      href={`/maintenance/${job.id}`}
      className="block border border-ink/15 bg-paper p-4 space-y-2 hover:border-ink/30 transition-colors shadow-sm"
    >
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {job.severity && (
            <span
              className={`text-[10px] font-semibold uppercase px-1.5 py-0.5 ${
                job.severity === "critical"
                  ? "bg-brick text-on-brick"
                  : job.severity === "high"
                    ? "bg-marigold text-on-marigold"
                    : job.severity === "medium"
                      ? "bg-ink/10 text-ink"
                      : "bg-ink/5 text-ink/70"
              }`}
            >
              {job.severity}
            </span>
          )}
          {job.categoryName && (
            <span className="text-ink/60">{job.categoryName}</span>
          )}
        </div>
        <span className="text-[10px] font-mono text-ink/50">
          #{job.id.slice(0, 8)}
        </span>
      </div>

      <p className="text-sm text-ink leading-snug font-medium">
        {job.description || "Maintenance task"}
      </p>

      <div className="flex items-center justify-between text-xs pt-1 border-t border-ink/10">
        <span className="font-medium text-ink/70">{statusLabel}</span>

        {job.hoursRemaining !== null &&
          job.status !== "resolution_submitted" && (
            <span
              className={`text-[11px] font-mono px-2 py-0.5 ${
                job.isOverdue
                  ? "bg-brick/10 text-brick font-bold"
                  : job.hoursRemaining < 2
                    ? "bg-marigold/10 text-marigold font-semibold"
                    : "bg-pine/10 text-pine"
              }`}
            >
              {job.isOverdue
                ? `${Math.abs(job.hoursRemaining).toFixed(1)}h overdue`
                : `${job.hoursRemaining.toFixed(1)}h remaining`}
            </span>
          )}
      </div>
    </Link>
  );
}
