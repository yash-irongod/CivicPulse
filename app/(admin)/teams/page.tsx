// Admin Teams & Workload Page.
// Review staff assignments, active workloads, and verify completed repairs.

"use client";

import React, { useEffect, useState } from "react";
import {
  VerifyResolution,
  type PendingVerification,
} from "@/components/admin/verify-resolution";
import {
  CheckCircle2,
  RefreshCw,
  CircleAlert,
} from "@/components/shared/icons";
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
    <div className="space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            Teams & Workload
          </h1>
          <p className="text-sm text-ink/55">
            Review staff capacity and verify completed repairs.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={isLoading}
          className="text-xs font-semibold px-4 py-2 rounded-xl border border-ink/12 bg-paper hover:bg-ink/[0.04] transition-all flex items-center gap-2 shadow-soft"
        >
          <RefreshCw
            size={14}
            className={isLoading ? "animate-spin text-marigold" : "text-ink/60"}
          />
          <span>Refresh</span>
        </button>
      </header>

      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-ink/8 bg-paper p-4 shadow-soft">
          <div className="text-xs text-ink/55 font-medium">Active Teams</div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {isLoading ? "—" : teams.length}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/8 bg-paper p-4 shadow-soft">
          <div className="text-xs text-ink/55 font-medium">Active Tickets</div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {isLoading ? "—" : totalActiveIncidents}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/8 bg-paper p-4 shadow-soft">
          <div className="text-xs text-ink/55 font-medium">
            Pending Approvals
          </div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {isLoading ? "—" : verifications.length}
          </div>
        </div>

        <div className="rounded-2xl border border-ink/8 bg-paper p-4 shadow-soft">
          <div className="text-xs text-ink/55 font-medium">Overdue</div>
          <div className="text-2xl font-bold mt-1 tabular-nums">
            {isLoading ? (
              "—"
            ) : totalOverdue > 0 ? (
              <span className="text-brick">{totalOverdue}</span>
            ) : (
              <span className="text-pine">0</span>
            )}
          </div>
        </div>
      </div>

      {/* 1. Pending Verifications Queue */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold text-ink">
              Pending Resolution Approvals
            </h2>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-marigold/12 text-marigold font-medium">
              {verifications.length} awaiting review
            </span>
          </div>
          <span className="text-xs text-ink/50">
            Committee approval required before closing
          </span>
        </div>

        {verifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/15 p-10 bg-paper text-center space-y-2.5">
            <CheckCircle2 size={32} className="text-pine/40 mx-auto" />
            <div className="text-sm font-semibold text-ink">All caught up</div>
            <p className="text-xs text-ink/55 max-w-sm mx-auto leading-relaxed">
              No completed repairs are waiting for committee sign-off right now.
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

      {/* 2. Team Workload Breakdown */}
      <section className="space-y-4 pt-4 border-t border-ink/8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">
            Team Workloads — Last 30 Days
          </h2>
        </div>

        {isLoading ? (
          <div className="h-44 rounded-2xl border border-ink/8 bg-paper animate-pulse" />
        ) : teams.length === 0 ? (
          <div className="rounded-2xl border border-ink/10 p-8 bg-paper text-center text-xs text-ink/55">
            No maintenance teams configured yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-ink/10 bg-paper overflow-x-auto shadow-soft">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink/8 bg-ink/[0.03] text-xs font-medium text-ink/60">
                  <th className="p-4 font-semibold">Team</th>
                  <th className="p-4 font-semibold">Active</th>
                  <th className="p-4 font-semibold">Overdue</th>
                  <th className="p-4 font-semibold">Resolved (30d)</th>
                  <th className="p-4 font-semibold">Avg Resolution</th>
                  <th className="p-4 font-semibold min-w-[200px]">Workload</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8 font-sans">
                {teams.map((t) => (
                  <tr
                    key={t.teamId}
                    className="hover:bg-ink/[0.02] transition-colors"
                  >
                    <td className="p-4">
                      <div className="font-semibold text-ink flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-ink/40" />
                        <span>{t.teamName}</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-ink/6 text-ink/80 font-medium tabular-nums">
                        {t.activeIncidentCount} tickets
                      </span>
                    </td>
                    <td className="p-4 tabular-nums">
                      {t.overdueIncidentCount > 0 ? (
                        <span className="text-brick font-semibold bg-brick/10 px-2.5 py-0.5 rounded-full">
                          {t.overdueIncidentCount} overdue
                        </span>
                      ) : (
                        <span className="text-pine font-medium">0</span>
                      )}
                    </td>
                    <td className="p-4 text-pine font-semibold tabular-nums">
                      {t.resolvedIncidentCount}
                    </td>
                    <td className="p-4 text-ink/70 tabular-nums">
                      {t.avgResolutionHours !== null
                        ? `${t.avgResolutionHours} hrs`
                        : "—"}
                    </td>
                    <td className="p-4">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between text-[11px] text-ink/60 tabular-nums">
                          <span>{t.workloadPercentage}% share</span>
                          <span>{t.activeIncidentCount} active</span>
                        </div>
                        <div className="w-full bg-ink/8 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-marigold h-full rounded-full transition-all duration-300"
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
