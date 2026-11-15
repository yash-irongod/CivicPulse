// Admin Analytics & Recurrence Hotspots Page (Task 9.5, §7.1, §7.2, §7.4).
// Deterministic recurrence cluster analysis and category hazard breakdown.
// Strict §7.2 color palette: Pine (#1F6F5C), Marigold (#9C6212), Brick (#B3432B), Ink (#151C2C), Paper (#F4F5F2).

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import type { RecurrenceHotspot } from "@/lib/analytics/recurrence";

interface CategoryStat {
  name: string;
  count: number;
  critical: number;
}

export default function AdminAnalyticsPage() {
  const [hotspots, setHotspots] = useState<RecurrenceHotspot[]>([]);
  const [categories, setCategories] = useState<CategoryStat[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadAnalytics() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/admin/analytics");
        if (!res.ok) throw new Error("Could not load analytics telemetry.");
        const data = await res.json();
        setHotspots(data.hotspots || []);
        setCategories(data.categories || []);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Error loading analytics.",
        );
      } finally {
        setIsLoading(false);
      }
    }
    loadAnalytics();
  }, []);

  const totalIncidents = categories.reduce((sum, c) => sum + c.count, 0);
  const totalCritical = categories.reduce((sum, c) => sum + c.critical, 0);

  return (
    <div className="space-y-8 max-w-6xl pb-12">
      {/* Header */}
      <header className="border-b border-ink/10 pb-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-ink tracking-tight">
              Recurring Issues & Analytics
            </h1>
            <p className="text-xs text-ink/70 mt-0.5">
              Tracks repeat complaints to distinguish between routine fixes and
              needed asset replacements.
            </p>
          </div>

          <div className="text-xs font-medium text-ink/70">Past 90 Days</div>
        </div>
      </header>

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick">
          {error}
        </div>
      )}

      {/* Advisory Note */}
      <div className="border-l-4 border-l-brick border border-ink/15 bg-brick/[0.04] p-4 space-y-1">
        <span className="text-xs font-bold text-brick block">
          Asset Replacement Notice
        </span>
        <p className="text-xs text-ink/80 leading-relaxed">
          Locations with <strong>3 or more recurring issues in 90 days</strong>{" "}
          often point to aging pipes, pumps, or wiring that may need full
          replacement rather than repeated patches.
        </p>
      </div>

      {/* 1. Recurrence Hotspots Table (Task 7.1, §0.5) */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-ink">
              Identified Infrastructure Hotspots
            </h2>
            <p className="text-xs text-ink/60 font-mono">
              Deterministic spatial clusters meeting threshold criteria
            </p>
          </div>
          <span className="text-xs font-mono text-ink/60 px-2 py-0.5 bg-ink/5 border border-ink/10">
            {hotspots.length} LOCATIONS FLAGGED
          </span>
        </div>

        {isLoading ? (
          <div className="h-44 border border-ink/10 bg-paper animate-pulse" />
        ) : hotspots.length === 0 ? (
          <div className="border border-dashed border-ink/20 p-8 bg-paper text-center space-y-2">
            <span className="text-pine text-lg font-mono">✓</span>
            <div className="text-xs font-semibold text-ink uppercase tracking-wider font-mono">
              Zero Chronic Recurrence Zones
            </div>
            <p className="text-xs text-ink/60 max-w-sm mx-auto">
              No society locations have recorded 3 or more incidents in the
              trailing 90-day window.
            </p>
          </div>
        ) : (
          <div className="border border-ink/20 bg-paper overflow-x-auto shadow-sm">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink/20 bg-ink/[0.04] text-ink font-mono text-[11px] uppercase tracking-wider">
                  <th className="p-3.5 font-bold">Zone / Location</th>
                  <th className="p-3.5 font-bold">Incident Domain</th>
                  <th className="p-3.5 font-bold">Recurrence Rate</th>
                  <th className="p-3.5 font-bold">
                    Audit History (Incident IDs)
                  </th>
                  <th className="p-3.5 font-bold">Risk Assessment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/10 font-sans">
                {hotspots.map((h, i) => (
                  <tr
                    key={i}
                    className="hover:bg-ink/[0.02] transition-colors border-l-4 border-l-brick"
                  >
                    <td className="p-3.5 font-semibold text-ink">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-brick" />
                        <span>{h.spaceName || "Common Society Area"}</span>
                      </div>
                    </td>
                    <td className="p-3.5 text-ink/80 font-mono text-[11px]">
                      {h.categoryName}
                    </td>
                    <td className="p-3.5 font-mono">
                      <span className="px-2 py-0.5 bg-brick text-on-brick font-bold text-[11px]">
                        {h.incidentCount} × REPEATS
                      </span>
                    </td>
                    <td className="p-3.5">
                      <div className="flex flex-wrap gap-1 font-mono text-[10px]">
                        {h.incidentIds.slice(0, 5).map((id) => (
                          <Link
                            key={id}
                            href={`/incidents`}
                            className="px-2 py-0.5 bg-ink/5 border border-ink/20 text-ink/80 hover:border-marigold hover:text-marigold hover:bg-paper transition-all"
                          >
                            #{id.slice(0, 8)}
                          </Link>
                        ))}
                        {h.incidentIds.length > 5 && (
                          <span className="text-ink/50 text-[10px] self-center">
                            +{h.incidentIds.length - 5} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-3.5 font-mono text-[11px]">
                      <span className="text-brick font-bold uppercase tracking-wider">
                        CHRONIC ASSET DEGRADATION
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Category Distribution & Critical Ratio (§7.2 strict color palette) */}
      <section className="space-y-4 pt-6 border-t border-ink/15">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider font-mono text-ink">
              Department Workload & Hazard Severity Breakdown
            </h2>
            <p className="text-xs text-ink/60 font-mono">
              Proportion of total tickets and critical safety hazards per domain
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-pine font-medium">
              <span className="w-2.5 h-2.5 bg-pine inline-block" /> Routine /
              Standard
            </span>
            <span className="flex items-center gap-1.5 text-brick font-medium">
              <span className="w-2.5 h-2.5 bg-brick inline-block" /> Critical
              Hazard ({totalCritical})
            </span>
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="border border-ink/15 p-6 bg-paper text-center text-xs text-ink/60">
            No incident distribution records available.
          </div>
        ) : (
          <div className="border border-ink/20 bg-paper p-6 space-y-5 shadow-sm">
            {categories.map((cat) => {
              const pct =
                totalIncidents > 0
                  ? Math.round((cat.count / totalIncidents) * 100)
                  : 0;
              const criticalPct =
                totalIncidents > 0
                  ? ((cat.critical / totalIncidents) * 100).toFixed(1)
                  : "0";
              const normalCount = cat.count - cat.critical;

              return (
                <div key={cat.name} className="space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-ink font-sans text-sm">
                        {cat.name}
                      </span>
                      <span className="text-ink/60">
                        ({cat.count} total tickets • {pct}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px]">
                      <span className="text-pine font-medium">
                        {normalCount} standard
                      </span>
                      {cat.critical > 0 && (
                        <span className="text-brick font-bold px-1.5 py-0.5 bg-brick/10 border border-brick/30">
                          {cat.critical} CRITICAL ({criticalPct}%)
                        </span>
                      )}
                    </div>
                  </div>

                  {/* High-tech Multi-Segment Bar */}
                  <div className="w-full bg-ink/10 h-3 overflow-hidden flex">
                    <div
                      className="bg-pine h-full transition-all duration-300"
                      style={{
                        width: `${Math.max(
                          2,
                          totalIncidents > 0
                            ? (normalCount / totalIncidents) * 100
                            : 0,
                        )}%`,
                      }}
                      title={`${normalCount} standard incidents`}
                    />
                    {cat.critical > 0 && (
                      <div
                        className="bg-brick h-full transition-all duration-300"
                        style={{
                          width: `${(cat.critical / totalIncidents) * 100}%`,
                        }}
                        title={`${cat.critical} critical hazard incidents`}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
