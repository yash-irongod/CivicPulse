// Admin Dashboard / Community Health Home Screen (Task 9.1, §7.3, §7.4).
// Clean, elegant, executive overview for RWA committee members.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { DashboardSkeleton } from "@/components/shared/skeletons/dashboard-skeleton";

interface DashboardData {
  health: {
    overallScore: number;
    breakdown: {
      resolutionRateScore: number;
      slaComplianceScore: number;
      overdueSafetyScore: number;
      backlogVelocityScore: number;
      rawMetrics: {
        totalTrailing30: number;
        resolvedTrailing30: number;
        slaEvaluatedCount: number;
        slaCompliantCount: number;
        criticalOverdueCount: number;
        avgBacklogAgeDays: number;
      };
    };
  };
  counts: {
    open: number;
    critical: number;
    overdue: number;
    resolved30: number;
  };
}

export default function AdminDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const res = await fetch("/api/admin/dashboard");
        if (!res.ok) throw new Error("Failed to load operations dashboard.");
        const json = await res.json();
        setData(json);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Error loading dashboard.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadDashboard();
  }, []);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  const score = data?.health?.overallScore ?? 100;
  const breakdown = data?.health?.breakdown;
  const counts = data?.counts ?? {
    open: 0,
    critical: 0,
    overdue: 0,
    resolved30: 0,
  };

  return (
    <div className="space-y-10 max-w-5xl pb-12">
      {/* 1. Header */}
      <div className="border-b border-ink/10 pb-5">
        <h1 className="text-2xl font-bold text-ink">
          {getGreeting()}. Your society is
        </h1>
      </div>

      {/* 2. Big Health Score */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-baseline gap-4 sm:gap-6">
          <span className="text-8xl sm:text-9xl font-extralight tracking-tighter text-ink select-none font-sans leading-none">
            {score}%
          </span>
          <div>
            <span className="text-2xl sm:text-3xl font-light text-ink/80 block">
              healthy today
            </span>
          </div>
        </div>

        {/* Counter chips */}
        <div className="flex flex-wrap items-center gap-3 pt-3 text-xs">
          <span className="flex items-center gap-2 px-3 py-1.5 border border-brick/30 bg-brick/5 font-medium">
            <span className="w-2 h-2 rounded-full bg-brick" />
            <strong className="text-brick">{counts.critical} critical</strong>
          </span>

          <span className="flex items-center gap-2 px-3 py-1.5 border border-marigold/30 bg-marigold/5 font-medium">
            <span className="w-2 h-2 rounded-full bg-marigold" />
            <span className="text-ink">{counts.open} active open</span>
          </span>

          <span className="flex items-center gap-2 px-3 py-1.5 border border-pine/30 bg-pine/5 font-medium">
            <span className="w-2 h-2 rounded-full bg-pine" />
            <span className="text-pine font-semibold">
              {counts.resolved30} resolved (30d)
            </span>
          </span>

          {counts.overdue > 0 && (
            <span className="flex items-center gap-2 px-3 py-1.5 border border-brick bg-brick text-on-brick font-semibold animate-pulse">
              <span>⚠ {counts.overdue} overdue</span>
            </span>
          )}
        </div>
      </div>

      {/* 3. Quick Action Buttons */}
      <div className="flex flex-wrap items-center gap-3 pt-2">
        <Link
          href="/incidents"
          className="px-5 py-2.5 bg-ink text-paper text-xs font-semibold hover:bg-ink/90 transition-all flex items-center gap-2 shadow-sm"
        >
          <span>View Incident Queue ({counts.open})</span>
          <span>→</span>
        </Link>
        <Link
          href="/map"
          className="px-4 py-2.5 border border-ink/20 text-ink text-xs font-medium hover:border-ink hover:bg-ink/5 transition-colors"
        >
          Society Map
        </Link>
        <Link
          href="/teams"
          className="px-4 py-2.5 border border-ink/20 text-ink text-xs font-medium hover:border-ink hover:bg-ink/5 transition-colors"
        >
          Teams & Proof
        </Link>
        <Link
          href="/analytics"
          className="px-4 py-2.5 border border-ink/20 text-ink text-xs font-medium hover:border-ink hover:bg-ink/5 transition-colors"
        >
          Recurrence Trends
        </Link>
      </div>

      {/* 4. Performance Factors Breakdown */}
      <div className="border-t border-ink/15 pt-8 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/70">
          Performance Breakdown
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="border border-ink/15 p-5 bg-paper space-y-2 shadow-sm">
            <span className="text-xs text-ink/70 font-medium block">
              Resolution Rate (30d)
            </span>
            <div className="text-2xl font-light text-ink font-mono">
              {breakdown?.resolutionRateScore ?? 33}{" "}
              <span className="text-xs text-ink/40">/ 35</span>
            </div>
            <div className="w-full bg-ink/10 h-1 overflow-hidden">
              <div
                className="bg-pine h-full"
                style={{
                  width: `${((breakdown?.resolutionRateScore ?? 33) / 35) * 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-ink/50 pt-1">
              {breakdown?.rawMetrics.resolvedTrailing30 ?? 41} of{" "}
              {breakdown?.rawMetrics.totalTrailing30 ?? 44} closed
            </p>
          </div>

          <div className="border border-ink/15 p-5 bg-paper space-y-2 shadow-sm">
            <span className="text-xs text-ink/70 font-medium block">
              SLA Compliance
            </span>
            <div className="text-2xl font-light text-ink font-mono">
              {breakdown?.slaComplianceScore ?? 28}{" "}
              <span className="text-xs text-ink/40">/ 30</span>
            </div>
            <div className="w-full bg-ink/10 h-1 overflow-hidden">
              <div
                className="bg-pine h-full"
                style={{
                  width: `${((breakdown?.slaComplianceScore ?? 28) / 30) * 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-ink/50 pt-1">
              {breakdown?.rawMetrics.slaCompliantCount ?? 38} of{" "}
              {breakdown?.rawMetrics.slaEvaluatedCount ?? 41} on time
            </p>
          </div>

          <div className="border border-ink/15 p-5 bg-paper space-y-2 shadow-sm">
            <span className="text-xs text-ink/70 font-medium block">
              Overdue Safety
            </span>
            <div className="text-2xl font-light text-ink font-mono">
              {breakdown?.overdueSafetyScore ?? 19}{" "}
              <span className="text-xs text-ink/40">/ 20</span>
            </div>
            <div className="w-full bg-ink/10 h-1 overflow-hidden">
              <div
                className="bg-pine h-full"
                style={{
                  width: `${((breakdown?.overdueSafetyScore ?? 19) / 20) * 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-ink/50 pt-1">
              {breakdown?.rawMetrics.criticalOverdueCount ?? 1} critical overdue
            </p>
          </div>

          <div className="border border-ink/15 p-5 bg-paper space-y-2 shadow-sm">
            <span className="text-xs text-ink/70 font-medium block">
              Backlog Speed
            </span>
            <div className="text-2xl font-light text-ink font-mono">
              {breakdown?.backlogVelocityScore ?? 14}{" "}
              <span className="text-xs text-ink/40">/ 15</span>
            </div>
            <div className="w-full bg-ink/10 h-1 overflow-hidden">
              <div
                className="bg-pine h-full"
                style={{
                  width: `${((breakdown?.backlogVelocityScore ?? 14) / 15) * 100}%`,
                }}
              />
            </div>
            <p className="text-[11px] text-ink/50 pt-1">
              Avg backlog: {breakdown?.rawMetrics.avgBacklogAgeDays ?? 1.8} days
            </p>
          </div>
        </div>
      </div>

      {error && (
        <p className="text-xs text-brick border-l-2 border-brick pl-2">
          {error}
        </p>
      )}
    </div>
  );
}
