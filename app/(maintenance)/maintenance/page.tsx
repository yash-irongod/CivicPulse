// Maintenance Staff — Assigned Work List.
// Sorted by urgency (overdue first, then closest SLA deadline).

"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  SeverityIndicator,
  getSeverityBorderClass,
} from "@/components/shared/severity-indicator";
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  ChevronRight,
  CircleAlert,
} from "@/components/shared/icons";

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
        <div className="h-6 bg-ink/8 w-1/3 animate-pulse rounded-lg" />
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="p-5 border border-ink/8 rounded-2xl bg-paper space-y-2.5 animate-pulse"
          >
            <div className="h-4 bg-ink/8 w-2/3 rounded" />
            <div className="h-3 bg-ink/6 w-1/2 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold text-ink tracking-tight">
          Assigned Work
        </h1>
        <p className="text-xs text-ink/55">
          {jobs.length === 0
            ? "No open assignments right now."
            : `${activeJobs.length} active · ${pendingReviewJobs.length} awaiting review`}
        </p>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      {jobs.length === 0 && !error && (
        <div className="rounded-2xl border border-dashed border-ink/15 bg-paper text-center py-14 px-6 space-y-2.5">
          <CheckCircle2 size={36} className="text-pine/35 mx-auto" />
          <p className="text-sm font-semibold text-ink">
            No work assigned right now
          </p>
          <p className="text-xs text-ink/50 max-w-xs mx-auto leading-relaxed">
            New tasks appear here as soon as the committee assigns work to your
            team.
          </p>
        </div>
      )}

      {/* Active jobs */}
      {activeJobs.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-xs font-semibold text-ink/55">Active tasks</h2>
          {activeJobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {/* Pending review */}
      {pendingReviewJobs.length > 0 && (
        <div className="space-y-3 pt-2">
          <h2 className="text-xs font-semibold text-ink/55">
            Submitted — awaiting committee review
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
  const borderClass = getSeverityBorderClass(job.severity);

  return (
    <Link
      href={`/maintenance/${job.id}`}
      className={`block rounded-2xl border border-ink/10 ${borderClass} bg-paper p-4 sm:p-5 space-y-3 hover:border-ink/25 hover:shadow-card transition-all shadow-soft group`}
    >
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          {job.severity && <SeverityIndicator severity={job.severity} />}
          {job.categoryName && (
            <span className="text-[11px] font-medium text-ink/65 bg-ink/5 px-2.5 py-0.5 rounded-full">
              {job.categoryName}
            </span>
          )}
        </div>
        <span className="text-[11px] font-mono text-ink/40 shrink-0">
          #{job.id.slice(0, 8)}
        </span>
      </div>

      <p className="text-sm text-ink leading-snug font-medium group-hover:text-ink">
        {job.description || "Maintenance task"}
      </p>

      <div className="flex items-center justify-between text-xs pt-2.5 border-t border-ink/8">
        <span className="font-medium text-ink/70 flex items-center gap-1">
          <span>{statusLabel}</span>
          <ChevronRight size={13} className="text-ink/35" />
        </span>

        {job.hoursRemaining !== null &&
          job.status !== "resolution_submitted" &&
          job.status !== "evidence_checked" && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full tabular-nums ${
                job.isOverdue
                  ? "bg-brick/10 text-brick"
                  : job.hoursRemaining < 2
                    ? "bg-marigold/10 text-marigold"
                    : "bg-pine/10 text-pine"
              }`}
            >
              {job.isOverdue ? (
                <AlertTriangle size={11} />
              ) : (
                <Clock size={11} />
              )}
              <span>
                {job.isOverdue
                  ? `${Math.abs(job.hoursRemaining).toFixed(1)}h overdue`
                  : `${job.hoursRemaining.toFixed(1)}h left`}
              </span>
            </span>
          )}
      </div>
    </Link>
  );
}
