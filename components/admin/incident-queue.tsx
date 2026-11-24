// Admin Incident Queue Component (Task 9.2, §7.2, §7.4).
// Dense scanning list in instrument-panel ops style with left-edge severity bars.
// SLA-sorted, filterable, with inline duplicate confirm/dismiss and manual assignment override.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IncidentQueueSkeleton } from "@/components/shared/skeletons/incident-queue-skeleton";
import { getSeverityBorderClass } from "@/components/shared/severity-indicator";

interface IncidentQueueItem {
  id: string;
  canonicalDescription: string | null;
  status: string;
  severity: string | null;
  assignedTeamId: string | null;
  teamName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  slaTargetAt: string | null;
  hoursRemaining: number | null;
  isOverdue: boolean;
  possibleDuplicateOf: string | null;
  createdAt: string;
}

interface FilterOption {
  id: string;
  name: string;
}

export function IncidentQueue() {
  const [incidents, setIncidents] = useState<IncidentQueueItem[]>([]);
  const [categories, setCategories] = useState<FilterOption[]>([]);
  const [teams, setTeams] = useState<FilterOption[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  const fetchQueue = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedCategory) params.set("category", selectedCategory);
      if (selectedTeam) params.set("team", selectedTeam);
      if (selectedStatus) params.set("status", selectedStatus);

      const res = await fetch(`/api/admin/incidents?${params.toString()}`);
      if (!res.ok) throw new Error("Could not load incidents queue.");
      const data = await res.json();
      setIncidents(data.incidents || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading queue.");
    } finally {
      setIsLoading(false);
    }
  }, [selectedCategory, selectedTeam, selectedStatus]);

  useEffect(() => {
    async function loadFilters() {
      try {
        const [catRes, teamsRes] = await Promise.all([
          fetch("/api/categories"),
          fetch("/api/admin/teams"),
        ]);
        if (catRes.ok) {
          const catData = await catRes.json();
          setCategories(catData.categories || []);
        }
        if (teamsRes.ok) {
          const teamsData = await teamsRes.json();
          setTeams(
            (teamsData.teams || []).map(
              (
                t: {
                  teamId?: string;
                  id?: string;
                  teamName?: string;
                  name?: string;
                },
                idx: number,
              ) => ({
                id: t.teamId || t.id || `team-fallback-${idx}`,
                name: t.teamName || t.name || `Team ${idx + 1}`,
              }),
            ),
          );
        }
      } catch {
        // Fallback filter list
      }
    }
    loadFilters();
  }, []);

  useEffect(() => {
    fetchQueue();
  }, [fetchQueue]);

  const handleDuplicateAction = async (
    incidentId: string,
    action: "confirm" | "dismiss",
  ) => {
    setActionLoadingId(incidentId);
    try {
      const res = await fetch(
        `/api/admin/incidents/${incidentId}/duplicate-action`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        },
      );
      if (!res.ok) throw new Error("Failed to update duplicate status.");
      await fetchQueue();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed duplicate action.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleQuickAssignTeam = async (incidentId: string, teamId: string) => {
    try {
      const res = await fetch(`/api/incidents/${incidentId}/transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignedTeamId: teamId }),
      });
      if (res.ok) fetchQueue();
    } catch {
      // Best-effort
    }
  };

  const filtered = incidents.filter((inc) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      inc.canonicalDescription?.toLowerCase().includes(term) ||
      inc.categoryName?.toLowerCase().includes(term) ||
      inc.id.toLowerCase().includes(term)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. Filter Bar */}
      <div className="border border-ink/20 bg-paper p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <input
            type="text"
            placeholder="Search reference or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="p-2 border border-ink/30 bg-paper text-ink min-w-[220px] focus:outline-none focus:border-marigold"
          />

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="p-2 border border-ink/30 bg-paper text-ink focus:outline-none"
          >
            <option value="">All Categories</option>
            {categories.map((c, idx) => (
              <option key={c.id || `cat-opt-${idx}`} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="p-2 border border-ink/30 bg-paper text-ink focus:outline-none"
          >
            <option value="">All Teams</option>
            {teams.map((t, idx) => (
              <option key={t.id || `team-opt-${idx}`} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="p-2 border border-ink/30 bg-paper text-ink focus:outline-none"
          >
            <option value="">All Statuses</option>
            <option value="reported">Reported</option>
            <option value="validated">Validated</option>
            <option value="prioritized">Prioritized</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="evidence_checked">Evidence Checked</option>
            <option value="resolved">Resolved</option>
            <option value="resident_feedback">Resident Feedback</option>
            <option value="escalated">Escalated</option>
            <option value="closed">Closed</option>
          </select>
        </div>

        <div className="text-xs font-mono text-ink/60">
          Showing {filtered.length} of {incidents.length} incidents
        </div>
      </div>

      {error && (
        <p className="text-xs text-brick border-l-2 border-brick pl-2">
          {error}
        </p>
      )}

      {/* 2. Ops-Room Dense Incident Scanning Table */}
      {isLoading ? (
        <IncidentQueueSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <div className="border border-ink/15 p-12 text-center bg-paper text-ink/70 text-xs font-mono reticle-box">
          <p className="font-semibold uppercase text-ink">
            Zero Incidents In Active Scope
          </p>
          <p className="text-ink/50 mt-1">
            No operational items match the selected category and department
            filters.
          </p>
        </div>
      ) : (
        <div className="border border-ink/20 bg-paper divide-y divide-ink/10 shadow-sm">
          {filtered.map((inc) => {
            const borderClass = getSeverityBorderClass(inc.severity);
            const isTerminal =
              inc.status === "closed" || inc.status === "resolved";

            return (
              <div
                key={inc.id}
                className={`${borderClass} p-4 transition-all hover:bg-ink/[0.02] group`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  {/* Left Column: Reference, Category, Description */}
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                      <Link
                        href={`/incidents/${inc.id}`}
                        className="font-semibold text-ink bg-ink/5 px-2 py-0.5 border border-ink/10 hover:bg-ink/10 hover:border-ink/30 transition-colors"
                      >
                        #{inc.id.slice(0, 8)}
                      </Link>
                      <span className="text-ink/30">•</span>
                      <span className="font-medium text-ink">
                        {inc.categoryName || "Uncategorized"}
                      </span>
                      <span className="text-ink/30">•</span>
                      <span className="uppercase text-[10px] tracking-wider text-ink/60 border border-ink/15 px-1.5 py-0.5">
                        {inc.status.replace("_", " ")}
                      </span>
                    </div>

                    <Link
                      href={`/incidents/${inc.id}`}
                      className="block text-xs text-ink/90 font-sans font-medium line-clamp-1 group-hover:text-ink hover:underline"
                    >
                      {inc.canonicalDescription || "No description logged"}
                    </Link>

                    {/* Inline Duplicate Alert Flag (§6.6, Task 9.2) */}
                    {inc.possibleDuplicateOf && (
                      <div className="mt-2.5 p-3 bg-marigold/5 border border-marigold/30 flex flex-wrap items-center justify-between gap-3 text-xs reticle-box">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 bg-marigold inline-block"></span>
                          <span className="text-ink text-xs font-mono">
                            <strong>AI DEDUPLICATION ALERT:</strong> Possible
                            duplicate of #{inc.possibleDuplicateOf.slice(0, 8)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === inc.id}
                            onClick={() =>
                              handleDuplicateAction(inc.id, "confirm")
                            }
                            className="px-3 py-1 bg-marigold text-on-marigold text-xs font-mono font-semibold hover:bg-marigold/90 disabled:opacity-50 transition-colors shadow-sm"
                          >
                            Merge Into Target
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === inc.id}
                            onClick={() =>
                              handleDuplicateAction(inc.id, "dismiss")
                            }
                            className="px-2.5 py-1 text-xs font-mono text-ink/60 hover:text-ink underline disabled:opacity-50"
                          >
                            Dismiss Flag
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Column: SLA Target, Team Assign, Severity */}
                  <div className="shrink-0 flex items-center justify-between sm:justify-end gap-4 text-xs pt-2 sm:pt-0 border-t sm:border-t-0 border-ink/10">
                    {/* Team assignment dropdown */}
                    <div className="text-right">
                      <select
                        value={inc.assignedTeamId || ""}
                        onChange={(e) =>
                          handleQuickAssignTeam(inc.id, e.target.value)
                        }
                        className="text-xs font-mono p-1.5 border border-ink/20 bg-paper text-ink focus:outline-none focus:border-marigold"
                      >
                        <option value="">
                          {inc.teamName ? inc.teamName : "Assign Team"}
                        </option>
                        {teams.map((t, idx) => (
                          <option
                            key={t.id || `assign-team-${idx}`}
                            value={t.id}
                          >
                            {t.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* SLA countdown badge in Plex Mono */}
                    <div className="w-32 text-right font-mono text-xs">
                      {isTerminal ? (
                        <span className="inline-block px-2.5 py-1 bg-pine/10 border border-pine/30 text-pine font-semibold">
                          ✓ RESOLVED
                        </span>
                      ) : inc.isOverdue ? (
                        <span className="inline-block px-2.5 py-1 bg-brick/10 border border-brick text-brick font-bold animate-pulse">
                          ⚠ OVERDUE ({inc.hoursRemaining}h)
                        </span>
                      ) : inc.hoursRemaining !== null ? (
                        <span
                          className={`inline-block px-2.5 py-1 border font-medium ${
                            inc.hoursRemaining < 2
                              ? "bg-marigold/10 border-marigold text-marigold font-semibold"
                              : "border-ink/20 text-ink/80 bg-paper"
                          }`}
                        >
                          ⏳ {inc.hoursRemaining}h remaining
                        </span>
                      ) : (
                        <span className="text-ink/40">NO SLA TARGET</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
