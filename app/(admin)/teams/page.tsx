// Admin Teams & Workload Page (Task 9.4, §7.3, §7.4).
// High-precision Workforce Dispatch Telemetry & Resolution Verification Console.

"use client";

import React, { useEffect, useState } from "react";
import {
  VerifyResolution,
  type PendingVerification,
} from "@/components/admin/verify-resolution";
import type { TeamWorkloadStats } from "@/lib/analytics/team-performance";

export default function AdminTeamsPage() {
  const [teams, setTeams] = useState<TeamWorkloadStats[]>([]);
  const [verifications, setVerifications] = useState<PendingVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/teams");
      if (!res.ok) throw new Error("Could not load team operations data.");
      const data = await res.json();
      setTeams(data.teams || []);
      setVerifications(data.pendingVerifications || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading teams.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const totalActiveIncidents = teams.reduce(
    (acc, t) => acc + t.activeIncidentCount,
    0,
  );
  const totalOverdue = teams.reduce(
    (acc, t) => acc + t.overdueIncidentCount,
    0,
  );

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header */}
      <header className="border-b border-ink/10 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink tracking-tight">
              Teams & Workload
            </h1>
            <p className="text-xs text-ink/70 mt-0.5">
              Review staff assignments and verify completed repairs.
            </p>
          </div>

          <button
            type="button"
            onClick={loadData}
            disabled={isLoading}
            className="text-xs font-semibold px-3 py-1.5 border border-ink/20 bg-paper hover:bg-ink/5 transition-all flex items-center gap-1.5"
          >
            <span className={isLoading ? "animate-spin" : ""}>↻</span>
            <span>Refresh</span>
          </button>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick">
          {error}
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="border border-ink/15 bg-paper p-4">
          <div className="text-xs text-ink/60 font-medium">Active Teams</div>
          <div className="text-2xl font-light text-ink mt-1 font-mono">
            {isLoading ? "..." : teams.length}
          </div>
        </div>

        <div className="border border-ink/15 bg-paper p-4">
          <div className="text-xs text-ink/60 font-medium">Active Tickets</div>
          <div className="text-2xl font-light text-ink mt-1 font-mono">
            {isLoading ? "..." : totalActiveIncidents}
          </div>
        </div>

        <div className="border border-ink/15 bg-paper p-4">
          <div className="text-xs text-ink/60 font-medium">
            Pending Approvals
          </div>
          <div className="text-2xl font-light text-ink mt-1 font-mono flex items-center gap-2">
            {isLoading ? "..." : verifications.length}
          </div>
        </div>

        <div className="border border-ink/15 bg-paper p-4">
          <div className="text-xs text-ink/60 font-medium">Overdue</div>
          <div className="text-2xl font-light mt-1 font-mono">
            {isLoading ? (
              "..."
            ) : totalOverdue > 0 ? (
              <span className="text-brick font-bold">{totalOverdue}</span>
            ) : (
              <span className="text-pine font-semibold">0</span>
            )}
          </div>
        </div>
      </div>

      {/* 1. Pending Verifications Queue (§9.4, §6.7) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-ink">
              Pending Resolution Approvals
            </h2>
            <span className="font-mono text-xs px-2 py-0.5 bg-marigold/15 text-marigold font-bold border border-marigold/30">
              {verifications.length} AWAITING HUMAN SIGN-OFF
            </span>
          </div>
          <span className="text-[11px] font-mono text-ink/60">
            Advisory AI check attached • Human authorization mandatory
          </span>
        </div>

        {verifications.length === 0 ? (
          <div className="border border-dashed border-ink/20 p-8 bg-paper text-center space-y-2">
            <span className="text-pine text-lg font-mono">✓</span>
            <div className="text-xs font-semibold text-ink uppercase tracking-wider font-mono">
              Verification Queue Clear
            </div>
            <p className="text-xs text-ink/60 max-w-sm mx-auto">
              No technician resolution submissions are currently awaiting RWA
              sign-off.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {verifications.map((item) => (
              <VerifyResolution
                key={item.id}
                item={item}
                onProcessed={loadData}
              />
            ))}
          </div>
        )}
      </section>

      {/* 2. Team Workload Breakdown (Task 7.3) */}
      <section className="space-y-4 pt-6 border-t border-ink/15">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-ink">
            Active Team Workloads & Dispatch Balance (Trailing 30 Days)
          </h2>
          <span className="text-[11px] font-mono text-ink/50">
            Deterministic capacity tracking
          </span>
        </div>

        {isLoading ? (
          <div className="h-44 border border-ink/10 bg-paper animate-pulse" />
        ) : teams.length === 0 ? (
          <div className="border border-ink/15 p-6 bg-paper text-center text-xs text-ink/60">
            No maintenance squads currently configured.
          </div>
        ) : (
          <div className="border border-ink/20 bg-paper overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink/20 bg-ink/[0.04] text-ink font-mono text-[11px] uppercase tracking-wider">
                  <th className="p-3.5 font-bold">Team Squad</th>
                  <th className="p-3.5 font-bold">Active Load</th>
                  <th className="p-3.5 font-bold">Overdue</th>
                  <th className="p-3.5 font-bold">Resolved (30d)</th>
                  <th className="p-3.5 font-bold">Avg Velocity</th>
                  <th className="p-3.5 font-bold min-w-[200px]">
                    Capacity Allocation
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 font-sans">
                {teams.map((t) => (
                  <tr
                    key={t.teamId}
                    className="hover:bg-ink/[0.02] transition-colors"
                  >
                    <td className="p-3.5">
                      <div className="font-semibold text-ink flex items-center gap-2">
                        <span className="w-2 h-2 rounded-sm bg-ink/40" />
                        <span>{t.teamName}</span>
                      </div>
                    </td>
                    <td className="p-3.5 font-mono font-medium text-ink">
                      <span className="px-2 py-0.5 bg-ink/5 border border-ink/15">
                        {t.activeIncidentCount} tickets
                      </span>
                    </td>
                    <td className="p-3.5 font-mono">
                      {t.overdueIncidentCount > 0 ? (
                        <span className="text-brick font-bold bg-brick/10 px-2 py-0.5 border border-brick/30">
                          {t.overdueIncidentCount} OVERDUE
                        </span>
                      ) : (
                        <span className="text-pine font-medium">0</span>
                      )}
                    </td>
                    <td className="p-3.5 font-mono text-pine font-bold">
                      {t.resolvedIncidentCount}
                    </td>
                    <td className="p-3.5 font-mono text-ink/80 text-[11px]">
                      {t.avgResolutionHours !== null
                        ? `${t.avgResolutionHours} hrs`
                        : "N/A"}
                    </td>
                    <td className="p-3.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between font-mono text-[10px] text-ink/70">
                          <span>{t.workloadPercentage}% of total</span>
                          <span>{t.activeIncidentCount} active</span>
                        </div>
                        <div className="w-full bg-ink/10 h-2 overflow-hidden">
                          <div
                            className="bg-marigold h-full transition-all duration-300"
                            style={{
                              width: `${Math.max(4, t.workloadPercentage)}%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
