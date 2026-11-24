// Admin Analytics & Recurring Locations Page.
// Clean hotspot identification & category breakdown — no jargon.

"use client";

import Link from "next/link";
import React, { useEffect, useState } from "react";
import {
  CheckCircle2,
  CircleAlert,
  AlertTriangle,
} from "@/components/shared/icons";
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
        if (!res.ok) throw new Error("Could not load analytics.");
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
    <div className="space-y-8 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            Recurring Issues & Analytics
          </h1>
          <p className="text-sm text-ink/55">
            Spot repeat complaints to decide when fixtures need replacement over
            temporary patches.
          </p>
        </div>

        <span className="text-xs font-medium text-ink/60 bg-ink/[0.04] px-3 py-1.5 rounded-full">
          Past 90 Days
        </span>
      </header>

      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Advisory Note */}
      <div className="flex items-start gap-3 rounded-2xl border-l-4 border-l-brick border border-ink/10 bg-brick/[0.04] p-4">
        <AlertTriangle size={17} className="text-brick shrink-0 mt-0.5" />
        <div className="space-y-1">
          <span className="text-xs font-semibold text-brick block">
            Asset Replacement Guidance
          </span>
          <p className="text-xs text-ink/75 leading-relaxed">
            Locations with{" "}
            <strong>3 or more recurring issues in 90 days</strong> often
            indicate aging pipes, pumps, or wiring that may need permanent
            replacement instead of repeated repairs.
          </p>
        </div>
      </div>

      {/* 1. Recurring Issue Locations */}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Recurring Issue Locations
            </h2>
            <p className="text-xs text-ink/55">
              Locations with 3+ repeat incidents in the past 90 days
            </p>
          </div>
          <span className="text-xs font-medium text-ink/70 px-3 py-1 rounded-full bg-ink/[0.05]">
            {hotspots.length} {hotspots.length === 1 ? "location" : "locations"}
          </span>
        </div>

        {isLoading ? (
          <div className="h-44 rounded-2xl border border-ink/8 bg-paper animate-pulse" />
        ) : hotspots.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/15 p-10 bg-paper text-center space-y-2.5">
            <CheckCircle2 size={32} className="text-pine/40 mx-auto" />
            <div className="text-sm font-semibold text-ink">
              No recurring hotspots
            </div>
            <p className="text-xs text-ink/55 max-w-sm mx-auto leading-relaxed">
              No society areas have logged 3 or more repeat incidents in the
              last 90 days.
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-ink/10 bg-paper overflow-x-auto shadow-soft">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-ink/8 bg-ink/[0.03] text-xs font-medium text-ink/60">
                  <th className="p-4 font-semibold">Location</th>
                  <th className="p-4 font-semibold">Category</th>
                  <th className="p-4 font-semibold">Occurrences</th>
                  <th className="p-4 font-semibold">Related Incidents</th>
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/8 font-sans">
                {hotspots.map((h, i) => (
                  <tr key={i} className="hover:bg-ink/[0.02] transition-colors">
                    <td className="p-4 font-semibold text-ink">
                      <div className="flex items-center gap-2.5">
                        <span className="w-2 h-2 rounded-full bg-brick shrink-0" />
                        <span>{h.spaceName || "Common Society Area"}</span>
                      </div>
                    </td>
                    <td className="p-4 text-ink/75">{h.categoryName}</td>
                    <td className="p-4">
                      <span className="px-2.5 py-0.5 rounded-full bg-brick/12 text-brick font-semibold text-[11px] tabular-nums">
                        {h.incidentCount} repeats
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1.5">
                        {h.incidentIds.slice(0, 5).map((id) => (
                          <Link
                            key={id}
                            href={`/incidents/${id}`}
                            className="px-2 py-0.5 rounded-lg bg-ink/[0.04] border border-ink/10 font-mono text-[11px] text-ink/75 hover:border-marigold hover:text-marigold transition-colors"
                          >
                            #{id.slice(0, 8)}
                          </Link>
                        ))}
                        {h.incidentIds.length > 5 && (
                          <span className="text-ink/50 text-[11px] self-center">
                            +{h.incidentIds.length - 5} more
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="p-4">
                      <span className="text-brick font-medium">
                        Needs replacement review
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 2. Category Breakdown */}
      <section className="space-y-4 pt-4 border-t border-ink/8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-ink">
              Incidents by Category
            </h2>
            <p className="text-xs text-ink/55">
              Distribution of reports across maintenance categories
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-pine font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-pine inline-block" />
              <span>Standard</span>
            </span>
            <span className="flex items-center gap-1.5 text-brick font-medium">
              <span className="w-2.5 h-2.5 rounded-full bg-brick inline-block" />
              <span>Critical ({totalCritical})</span>
            </span>
          </div>
        </div>

        {categories.length === 0 ? (
          <div className="rounded-2xl border border-ink/10 p-8 bg-paper text-center text-xs text-ink/55">
            No incident distribution records available yet.
          </div>
        ) : (
          <div className="rounded-2xl border border-ink/10 bg-paper p-5 sm:p-6 space-y-5 shadow-soft">
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
                <div key={cat.name} className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink text-sm">
                        {cat.name}
                      </span>
                      <span className="text-ink/55 tabular-nums">
                        {cat.count} total ({pct}%)
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <span className="text-pine font-medium tabular-nums">
                        {normalCount} standard
                      </span>
                      {cat.critical > 0 && (
                        <span className="text-brick font-semibold px-2 py-0.5 rounded-full bg-brick/10 tabular-nums">
                          {cat.critical} critical ({criticalPct}%)
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="w-full bg-ink/8 h-2.5 rounded-full overflow-hidden flex">
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
                        title={`${cat.critical} critical incidents`}
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
