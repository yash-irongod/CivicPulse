// Admin Incident Queue — filterable, sortable incident list.
// Modern card layout, clean filters, no jargon.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { IncidentQueueSkeleton } from "@/components/shared/skeletons/incident-queue-skeleton";
import { getSeverityBorderClass } from "@/components/shared/severity-indicator";
import {
  Search,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ClipboardList,
} from "@/components/shared/icons";

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

const STATUS_LABEL: Record<string, string> = {
  reported: "Reported",
  validated: "Validated",
  prioritized: "Prioritized",
  assigned: "Assigned",
  in_progress: "In Progress",
  resolution_submitted: "Resolution Submitted",
  evidence_checked: "Evidence Checked",
  resolved: "Resolved",
  resident_feedback: "Feedback Needed",
  escalated: "Escalated",
  closed: "Closed",
};

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
      if (!res.ok) throw new Error("Could not load incidents.");
      const data = await res.json();
      setIncidents(data.incidents || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error loading incidents.");
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
        // Fallback
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
    <div className="space-y-5">
      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30"
          />
          <input
            type="text"
            placeholder="Search incidents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50 focus:ring-2 focus:ring-marigold/10 transition-all"
          />
        </div>
        <div className="flex gap-2">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="text-sm py-2.5 px-3 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50"
          >
            <option value="">All categories</option>
            {categories.map((c, idx) => (
              <option key={c.id || `cat-opt-${idx}`} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={selectedTeam}
            onChange={(e) => setSelectedTeam(e.target.value)}
            className="text-sm py-2.5 px-3 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50"
          >
            <option value="">All teams</option>
            {teams.map((t, idx) => (
              <option key={t.id || `team-opt-${idx}`} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value)}
            className="text-sm py-2.5 px-3 border border-ink/10 bg-paper text-ink rounded-lg focus:outline-none focus:border-marigold/50"
          >
            <option value="">All statuses</option>
            <option value="reported">Reported</option>
            <option value="validated">Validated</option>
            <option value="prioritized">Prioritized</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="evidence_checked">Evidence Checked</option>
            <option value="resolved">Resolved</option>
            <option value="resident_feedback">Feedback Needed</option>
            <option value="escalated">Escalated</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      </div>

      {/* Count */}
      <div className="text-xs text-ink/40">
        {filtered.length} of {incidents.length} incidents
      </div>

      {error && (
        <div className="p-3 bg-brick/8 border border-brick/15 rounded-xl text-sm text-brick">
          {error}
        </div>
      )}

      {/* Incident list */}
      {isLoading ? (
        <IncidentQueueSkeleton count={6} />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <ClipboardList size={48} className="text-ink/10 mb-4" />
          <p className="text-sm font-medium text-ink/60">No incidents found</p>
          <p className="text-xs text-ink/40 mt-1">Try adjusting your filters</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((inc) => {
            const borderClass = getSeverityBorderClass(inc.severity);
            const isTerminal =
              inc.status === "closed" || inc.status === "resolved";

            return (
              <div
                key={inc.id}
                className={`bg-paper border border-ink/8 ${borderClass} rounded-xl p-4 hover:shadow-soft transition-all duration-200 group`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  {/* Left: description + meta */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link
                        href={`/incidents/${inc.id}`}
                        className="text-xs font-mono font-medium text-ink/50 hover:text-ink transition-colors"
                      >
                        #{inc.id.slice(0, 8)}
                      </Link>
                      <span className="text-xs font-medium text-ink/60 bg-ink/4 px-2 py-0.5 rounded-full">
                        {inc.categoryName || "Uncategorized"}
                      </span>
                      <span className="text-xs text-ink/40 bg-ink/4 px-2 py-0.5 rounded-full">
                        {STATUS_LABEL[inc.status] || inc.status}
                      </span>
                    </div>

                    <Link
                      href={`/incidents/${inc.id}`}
                      className="block text-sm text-ink/85 font-medium line-clamp-1 group-hover:text-ink transition-colors"
                    >
                      {inc.canonicalDescription || "No description"}
                    </Link>

                    {/* Duplicate alert */}
                    {inc.possibleDuplicateOf && (
                      <div className="flex flex-wrap items-center justify-between gap-2 mt-2 p-3 bg-marigold/5 border border-marigold/15 rounded-lg">
                        <div className="flex items-center gap-2 text-xs text-ink/70">
                          <Sparkles size={14} className="text-marigold" />
                          <span>
                            Possible duplicate of{" "}
                            <span className="font-mono font-medium">
                              #{inc.possibleDuplicateOf.slice(0, 8)}
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={actionLoadingId === inc.id}
                            onClick={() =>
                              handleDuplicateAction(inc.id, "confirm")
                            }
                            className="px-3 py-1.5 bg-marigold text-on-marigold text-xs font-medium rounded-md hover:bg-marigold/90 disabled:opacity-50 transition-colors"
                          >
                            Merge
                          </button>
                          <button
                            type="button"
                            disabled={actionLoadingId === inc.id}
                            onClick={() =>
                              handleDuplicateAction(inc.id, "dismiss")
                            }
                            className="px-3 py-1.5 text-xs text-ink/50 hover:text-ink font-medium transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right: team + SLA */}
                  <div className="shrink-0 flex items-center sm:flex-col sm:items-end gap-3 sm:gap-2">
                    <select
                      value={inc.assignedTeamId || ""}
                      onChange={(e) =>
                        handleQuickAssignTeam(inc.id, e.target.value)
                      }
                      className="text-xs py-1.5 px-2 border border-ink/10 bg-paper text-ink rounded-md focus:outline-none focus:border-marigold/50"
                    >
                      <option value="">
                        {inc.teamName ? inc.teamName : "Assign team"}
                      </option>
                      {teams.map((t, idx) => (
                        <option key={t.id || `assign-team-${idx}`} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>

                    <div className="text-xs">
                      {isTerminal ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-pine/8 text-pine font-medium rounded-full">
                          <CheckCircle2 size={12} />
                          Resolved
                        </span>
                      ) : inc.isOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-brick/8 text-brick font-medium rounded-full">
                          <AlertTriangle size={12} />
                          {inc.hoursRemaining}h overdue
                        </span>
                      ) : inc.hoursRemaining !== null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-medium ${
                            inc.hoursRemaining < 2
                              ? "bg-marigold/8 text-marigold"
                              : "bg-ink/4 text-ink/50"
                          }`}
                        >
                          <Clock size={12} />
                          {inc.hoursRemaining}h left
                        </span>
                      ) : (
                        <span className="text-ink/30 text-[11px]">No SLA</span>
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
