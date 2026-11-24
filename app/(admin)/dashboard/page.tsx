// Admin Dashboard — society health overview.
// Big score, metric cards, quick actions. Clean, modern, no jargon.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import { DashboardSkeleton } from "@/components/shared/skeletons/dashboard-skeleton";
import {
  ArrowRight,
  AlertTriangle,
  Clock,
  CheckCircle2,
  ClipboardList,
  MapPin,
  Wrench,
  BarChart3,
} from "@/components/shared/icons";

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
        if (!res.ok) throw new Error("Failed to load dashboard.");
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

  const scoreColor =
    score >= 80 ? "text-pine" : score >= 50 ? "text-marigold" : "text-brick";

  const metrics = [
    {
      label: "Resolution rate",
      value: breakdown?.resolutionRateScore ?? 33,
      max: 35,
      detail: `${breakdown?.rawMetrics.resolvedTrailing30 ?? 0} of ${breakdown?.rawMetrics.totalTrailing30 ?? 0} closed`,
    },
    {
      label: "SLA compliance",
      value: breakdown?.slaComplianceScore ?? 28,
      max: 30,
      detail: `${breakdown?.rawMetrics.slaCompliantCount ?? 0} of ${breakdown?.rawMetrics.slaEvaluatedCount ?? 0} on time`,
    },
    {
      label: "Overdue safety",
      value: breakdown?.overdueSafetyScore ?? 19,
      max: 20,
      detail: `${breakdown?.rawMetrics.criticalOverdueCount ?? 0} critical overdue`,
    },
    {
      label: "Backlog speed",
      value: breakdown?.backlogVelocityScore ?? 14,
      max: 15,
      detail: `Avg ${breakdown?.rawMetrics.avgBacklogAgeDays ?? 0} days`,
    },
  ];

  return (
    <div className="space-y-8 pb-8">
      {/* Greeting + score */}
      <div className="space-y-6">
        <div>
          <p className="text-sm text-ink/50">{getGreeting()}</p>
          <h1 className="text-2xl font-bold text-ink tracking-tight mt-0.5">
            Society Health
          </h1>
        </div>

        <div className="flex items-end gap-4">
          <span
            className={`text-7xl sm:text-8xl font-extralight tracking-tighter leading-none ${scoreColor}`}
          >
            {score}
          </span>
          <div className="pb-2">
            <span className="text-2xl font-light text-ink/40">/ 100</span>
            <p className="text-xs text-ink/40 mt-1">Health score</p>
          </div>
        </div>

        {/* Summary chips */}
        <div className="flex flex-wrap items-center gap-2">
          {counts.critical > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brick/8 text-brick text-xs font-medium rounded-full">
              <AlertTriangle size={13} />
              {counts.critical} critical
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-marigold/8 text-marigold text-xs font-medium rounded-full">
            <Clock size={13} />
            {counts.open} open
          </span>
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-pine/8 text-pine text-xs font-medium rounded-full">
            <CheckCircle2 size={13} />
            {counts.resolved30} resolved (30d)
          </span>
          {counts.overdue > 0 && (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-brick text-on-brick text-xs font-semibold rounded-full">
              <AlertTriangle size={13} />
              {counts.overdue} overdue
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/incidents"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink text-paper text-sm font-medium rounded-lg hover:bg-ink/90 transition-all active:scale-[0.98]"
        >
          <ClipboardList size={15} />
          Incidents ({counts.open})
          <ArrowRight size={14} />
        </Link>
        <Link
          href="/map"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-ink/10 text-ink text-sm font-medium rounded-lg hover:bg-ink/4 transition-colors"
        >
          <MapPin size={15} />
          Map
        </Link>
        <Link
          href="/teams"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-ink/10 text-ink text-sm font-medium rounded-lg hover:bg-ink/4 transition-colors"
        >
          <Wrench size={15} />
          Teams
        </Link>
        <Link
          href="/analytics"
          className="inline-flex items-center gap-2 px-4 py-2.5 border border-ink/10 text-ink text-sm font-medium rounded-lg hover:bg-ink/4 transition-colors"
        >
          <BarChart3 size={15} />
          Analytics
        </Link>
      </div>

      {/* Performance metrics */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold text-ink/60">
          Performance breakdown
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {metrics.map((m) => {
            const pct = Math.round((m.value / m.max) * 100);
            return (
              <div
                key={m.label}
                className="bg-paper border border-ink/8 rounded-xl p-5 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-ink/50 font-medium">
                    {m.label}
                  </span>
                  <span className="text-xs text-ink/40">
                    {m.value}/{m.max}
                  </span>
                </div>
                <div className="w-full bg-ink/6 h-1.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-700 ${
                      pct >= 80
                        ? "bg-pine"
                        : pct >= 50
                          ? "bg-marigold"
                          : "bg-brick"
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-ink/40">{m.detail}</p>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-brick/8 border border-brick/15 rounded-xl text-sm text-brick">
          {error}
        </div>
      )}
    </div>
  );
}
