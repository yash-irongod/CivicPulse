// Admin Teams, Approvals, Categories & SLA Configuration Page.
// Zero-SQL management of teams, categories, category coverage, and SLA target hours.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  VerifyResolution,
  type PendingVerification,
} from "@/components/admin/verify-resolution";
import {
  Check,
  CheckCircle2,
  CircleAlert,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  SlidersHorizontal,
  Trash2,
  Wrench,
  X,
} from "@/components/shared/icons";
import type { TeamWorkloadStats } from "@/lib/analytics/team-performance";
import type { Severity } from "@/lib/validation/transition";

interface ManagedTeam {
  id: string;
  name: string;
  categoryIds: string[];
  memberCount: number;
}

interface ManagedCategory {
  id: string;
  name: string;
  isActive: boolean;
}

interface SlaPolicyItem {
  id: string;
  categoryId: string;
  severity: Severity;
  targetHours: number;
}

const SEVERITIES: Array<{
  key: Severity;
  label: string;
  defaultHours: number;
}> = [
  { key: "critical", label: "Critical", defaultHours: 4 },
  { key: "high", label: "High", defaultHours: 24 },
  { key: "medium", label: "Medium", defaultHours: 72 },
  { key: "low", label: "Low", defaultHours: 168 },
];

export default function AdminTeamsPage() {
  const [activeTab, setActiveTab] = useState<"operations" | "setup">(
    "operations",
  );

  // Operations tab data
  const [teams, setTeams] = useState<TeamWorkloadStats[]>([]);
  const [verifications, setVerifications] = useState<PendingVerification[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Setup tab data
  const [managedTeams, setManagedTeams] = useState<ManagedTeam[]>([]);
  const [categories, setCategories] = useState<ManagedCategory[]>([]);
  const [slaDrafts, setSlaDrafts] = useState<Record<string, string>>({});
  const [isSetupLoading, setIsSetupLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [setupMessage, setSetupMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Forms & inline edits
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamCategoryIds, setNewTeamCategoryIds] = useState<string[]>([]);
  const [isAddingTeam, setIsAddingTeam] = useState(false);
  const [editingTeamId, setEditingTeamId] = useState<string | null>(null);
  const [editingTeamName, setEditingTeamName] = useState("");

  const [newCategoryName, setNewCategoryName] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [editingCatName, setEditingCatName] = useState("");

  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [savedCellKey, setSavedCellKey] = useState<string | null>(null);
  const [busyTeamId, setBusyTeamId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
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
  }, []);

  const loadSetup = useCallback(async () => {
    setIsSetupLoading(true);
    try {
      const res = await fetch("/api/admin/teams/manage");
      if (!res.ok) throw new Error("Could not load team configuration.");
      const data = await res.json();
      setManagedTeams(data.teams || []);
      const cats: ManagedCategory[] = data.categories || [];
      setCategories(cats);

      const drafts: Record<string, string> = {};
      for (const cat of cats) {
        for (const sev of SEVERITIES) {
          drafts[`${cat.id}:${sev.key}`] = String(sev.defaultHours);
        }
      }
      for (const p of (data.slaPolicies || []) as SlaPolicyItem[]) {
        drafts[`${p.categoryId}:${p.severity}`] = String(p.targetHours);
      }
      setSlaDrafts(drafts);
    } catch (err) {
      setSetupMessage({
        text:
          err instanceof Error
            ? err.message
            : "Error loading categories & SLA configuration.",
        type: "error",
      });
    } finally {
      setIsSetupLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    loadSetup();
  }, [loadData, loadSetup]);

  const refreshAll = async () => {
    await Promise.all([loadData(), loadSetup()]);
  };

  // --- Team CRUD ---
  const handleCreateTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName.trim()) return;
    setIsAddingTeam(true);
    setSetupMessage(null);
    try {
      const res = await fetch("/api/admin/teams/manage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTeamName.trim(),
          categoryIds: newTeamCategoryIds,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "already_exists"
            ? "A team with this name already exists."
            : "Failed to create team.",
        );
      }
      setNewTeamName("");
      setNewTeamCategoryIds([]);
      setSetupMessage({
        text: `Team "${data.team.name}" created.`,
        type: "success",
      });
      await refreshAll();
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Error creating team.",
        type: "error",
      });
    } finally {
      setIsAddingTeam(false);
    }
  };

  const handleToggleTeamCategory = async (
    team: ManagedTeam,
    categoryId: string,
  ) => {
    const has = team.categoryIds.includes(categoryId);
    const nextIds = has
      ? team.categoryIds.filter((id) => id !== categoryId)
      : [...team.categoryIds, categoryId];

    setBusyTeamId(team.id);
    try {
      const res = await fetch("/api/admin/teams/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, categoryIds: nextIds }),
      });
      if (!res.ok) throw new Error("Failed to update team categories.");
      setManagedTeams((prev) =>
        prev.map((t) =>
          t.id === team.id ? { ...t, categoryIds: nextIds } : t,
        ),
      );
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Update failed.",
        type: "error",
      });
    } finally {
      setBusyTeamId(null);
    }
  };

  const handleRenameTeam = async (teamId: string) => {
    if (!editingTeamName.trim()) return;
    setBusyTeamId(teamId);
    try {
      const res = await fetch("/api/admin/teams/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, name: editingTeamName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "already_exists"
            ? "Another team already has that name."
            : "Failed to rename team.",
        );
      }
      setEditingTeamId(null);
      await refreshAll();
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Rename failed.",
        type: "error",
      });
    } finally {
      setBusyTeamId(null);
    }
  };

  const handleDeleteTeam = async (team: ManagedTeam) => {
    setBusyTeamId(team.id);
    setSetupMessage(null);
    try {
      const res = await fetch("/api/admin/teams/manage", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "team_has_incidents"
            ? `"${team.name}" cannot be deleted because incidents are already assigned to it.`
            : "Failed to delete team.",
        );
      }
      setSetupMessage({
        text: `Team "${team.name}" deleted.`,
        type: "success",
      });
      await refreshAll();
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Delete failed.",
        type: "error",
      });
    } finally {
      setBusyTeamId(null);
    }
  };

  // --- Category CRUD ---
  const handleCreateCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    setIsAddingCategory(true);
    setSetupMessage(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "already_exists"
            ? "Category already exists."
            : "Failed to add category.",
        );
      }
      setNewCategoryName("");
      setSetupMessage({
        text: `Category "${data.category.name}" added with starter SLA targets.`,
        type: "success",
      });
      await loadSetup();
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Error adding category.",
        type: "error",
      });
    } finally {
      setIsAddingCategory(false);
    }
  };

  const handleToggleCategoryActive = async (cat: ManagedCategory) => {
    setSetupMessage(null);
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: cat.id, isActive: !cat.isActive }),
      });
      if (!res.ok) throw new Error("Failed to update category.");
      await loadSetup();
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Update failed.",
        type: "error",
      });
    }
  };

  const handleRenameCategory = async (catId: string) => {
    if (!editingCatName.trim()) return;
    try {
      const res = await fetch("/api/admin/categories", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId: catId,
          name: editingCatName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "already_exists"
            ? "Category name already exists."
            : "Rename failed.",
        );
      }
      setEditingCatId(null);
      await loadSetup();
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "Rename failed.",
        type: "error",
      });
    }
  };

  // --- SLA save ---
  const handleSaveSlaCell = async (categoryId: string, severity: Severity) => {
    const cellKey = `${categoryId}:${severity}`;
    const hours = Number.parseInt(slaDrafts[cellKey] ?? "", 10);
    if (!Number.isFinite(hours) || hours < 1 || hours > 2160) {
      setSetupMessage({
        text: "SLA hours must be a whole number between 1 and 2160.",
        type: "error",
      });
      return;
    }

    setSavingCellKey(cellKey);
    try {
      const res = await fetch("/api/admin/sla", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId, severity, targetHours: hours }),
      });
      if (!res.ok) throw new Error("Failed to update SLA.");
      setSavedCellKey(cellKey);
      setTimeout(() => setSavedCellKey(null), 2000);
    } catch (err) {
      setSetupMessage({
        text: err instanceof Error ? err.message : "SLA update failed.",
        type: "error",
      });
    } finally {
      setSavingCellKey(null);
    }
  };

  const totalActiveIncidents = teams.reduce(
    (acc, t) => acc + t.activeIncidentCount,
    0,
  );
  const totalOverdue = teams.reduce(
    (acc, t) => acc + t.overdueIncidentCount,
    0,
  );
  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            Teams, Approvals & SLAs
          </h1>
          <p className="text-sm text-ink/55">
            Verify completed repairs, review team capacity, and configure
            categories & deadlines.
          </p>
        </div>

        <button
          type="button"
          onClick={refreshAll}
          disabled={isLoading || isSetupLoading}
          className="text-xs font-semibold px-4 py-2 rounded-xl border border-ink/12 bg-paper hover:bg-ink/[0.04] transition-all flex items-center gap-2 shadow-soft"
        >
          <RefreshCw
            size={14}
            className={
              isLoading || isSetupLoading
                ? "animate-spin text-marigold"
                : "text-ink/60"
            }
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

      {/* Animated Pill Tab Switch */}
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-ink/[0.04] border border-ink/8">
        <button
          type="button"
          onClick={() => setActiveTab("operations")}
          className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
            activeTab === "operations"
              ? "text-paper"
              : "text-ink/65 hover:text-ink"
          }`}
        >
          {activeTab === "operations" && (
            <motion.span
              layoutId="teams-tab-pill"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute inset-0 rounded-full bg-ink"
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <Wrench size={13} />
            <span>
              Approvals & Workloads
              {verifications.length > 0 ? ` (${verifications.length})` : ""}
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("setup")}
          className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
            activeTab === "setup" ? "text-paper" : "text-ink/65 hover:text-ink"
          }`}
        >
          {activeTab === "setup" && (
            <motion.span
              layoutId="teams-tab-pill"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute inset-0 rounded-full bg-ink"
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <SlidersHorizontal size={13} />
            <span>Categories, Teams & SLAs</span>
          </span>
        </button>
      </div>

      {activeTab === "operations" ? (
        <div className="space-y-8">
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
                <div className="text-sm font-semibold text-ink">
                  All caught up
                </div>
                <p className="text-xs text-ink/55 max-w-sm mx-auto leading-relaxed">
                  No completed repairs are waiting for committee sign-off right
                  now.
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
                No maintenance teams configured yet — open{" "}
                <button
                  type="button"
                  onClick={() => setActiveTab("setup")}
                  className="font-semibold text-marigold hover:underline"
                >
                  Categories, Teams & SLAs
                </button>{" "}
                to add your first team.
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
                      <th className="p-4 font-semibold min-w-[200px]">
                        Workload
                      </th>
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
      ) : (
        <div className="space-y-8">
          {setupMessage && (
            <div
              className={`flex items-center justify-between gap-2 p-3.5 rounded-xl border-l-4 text-xs font-medium ${
                setupMessage.type === "success"
                  ? "bg-pine/10 border-pine text-pine"
                  : "bg-brick/10 border-brick text-brick"
              }`}
            >
              <div className="flex items-center gap-2">
                {setupMessage.type === "success" ? (
                  <CheckCircle2 size={15} />
                ) : (
                  <CircleAlert size={15} />
                )}
                <span>{setupMessage.text}</span>
              </div>
              <button
                type="button"
                onClick={() => setSetupMessage(null)}
                className="p-1 opacity-60 hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
          )}

          {/* 1. Maintenance Teams & Category Coverage */}
          <section className="space-y-4">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Maintenance Teams & Category Coverage
              </h2>
              <p className="text-xs text-ink/55">
                Create in-house or vendor teams and click category pills to set
                what each team handles. Add workers to teams from Residents &
                Flats.
              </p>
            </div>

            <form
              onSubmit={handleCreateTeam}
              className="rounded-2xl border border-ink/10 bg-paper p-4 sm:p-5 shadow-soft space-y-3"
            >
              <div className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="text"
                  placeholder="New team name (e.g. Generator AMC or Gardeners)"
                  value={newTeamName}
                  onChange={(e) => setNewTeamName(e.target.value)}
                  className="flex-1 text-sm p-2.5 border border-ink/15 rounded-xl bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-marigold"
                />
                <button
                  type="submit"
                  disabled={isAddingTeam || !newTeamName.trim()}
                  className="px-4 py-2.5 bg-pine text-on-pine text-xs font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50 flex items-center justify-center gap-1.5 transition-all"
                >
                  <Plus size={14} />
                  <span>{isAddingTeam ? "Adding…" : "Add Team"}</span>
                </button>
              </div>

              {activeCategories.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1 text-xs">
                  <span className="text-[11px] text-ink/55 mr-1">Covers:</span>
                  {activeCategories.map((cat) => {
                    const selected = newTeamCategoryIds.includes(cat.id);
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() =>
                          setNewTeamCategoryIds((prev) =>
                            selected
                              ? prev.filter((id) => id !== cat.id)
                              : [...prev, cat.id],
                          )
                        }
                        className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                          selected
                            ? "border-marigold bg-marigold/15 text-ink"
                            : "border-ink/12 bg-paper text-ink/60 hover:text-ink"
                        }`}
                      >
                        {cat.name}
                      </button>
                    );
                  })}
                </div>
              )}
            </form>

            {managedTeams.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-ink/15 p-8 bg-paper text-center text-xs text-ink/55">
                No teams yet — add one above to start onboarding maintenance
                workers.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {managedTeams.map((team) => (
                  <div
                    key={team.id}
                    className="rounded-2xl border border-ink/10 bg-paper p-4 shadow-soft space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      {editingTeamId === team.id ? (
                        <div className="flex items-center gap-2 flex-1">
                          <input
                            type="text"
                            value={editingTeamName}
                            onChange={(e) => setEditingTeamName(e.target.value)}
                            className="flex-1 text-xs p-1.5 border border-marigold rounded-lg bg-paper text-ink"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameTeam(team.id)}
                            className="px-2.5 py-1 bg-pine text-on-pine text-[11px] font-semibold rounded-lg"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingTeamId(null)}
                            className="p-1 text-ink/50 hover:text-ink"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-bold text-sm text-ink truncate">
                              {team.name}
                            </span>
                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-ink/[0.05] text-ink/65 tabular-nums">
                              {team.memberCount} staff
                            </span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingTeamId(team.id);
                                setEditingTeamName(team.name);
                              }}
                              className="p-1.5 text-ink/45 hover:text-ink rounded-lg hover:bg-ink/5"
                              title="Rename team"
                              aria-label="Rename team"
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              type="button"
                              disabled={busyTeamId === team.id}
                              onClick={() => handleDeleteTeam(team)}
                              className="p-1.5 text-brick/60 hover:text-brick rounded-lg hover:bg-brick/8 disabled:opacity-50"
                              title="Delete unused team"
                              aria-label="Delete team"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {activeCategories.length === 0 ? (
                        <span className="text-[11px] text-ink/45">
                          Add categories below to map team responsibilities.
                        </span>
                      ) : (
                        activeCategories.map((cat) => {
                          const assigned = team.categoryIds.includes(cat.id);
                          return (
                            <button
                              key={cat.id}
                              type="button"
                              disabled={busyTeamId === team.id}
                              onClick={() =>
                                handleToggleTeamCategory(team, cat.id)
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                                assigned
                                  ? "border-pine/35 bg-pine/10 text-pine"
                                  : "border-ink/10 bg-paper text-ink/45 hover:text-ink"
                              }`}
                            >
                              {assigned && <Check size={10} />}
                              <span>{cat.name}</span>
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* 2. Issue Categories */}
          <section className="space-y-4 pt-4 border-t border-ink/8">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Issue Categories
              </h2>
              <p className="text-xs text-ink/55">
                Active categories appear in resident reporting & AI triage.
                Archive categories you no longer need instead of deleting past
                history.
              </p>
            </div>

            <form
              onSubmit={handleCreateCategory}
              className="flex gap-2.5 max-w-md"
            >
              <input
                type="text"
                placeholder="e.g. Intercom / CCTV or Parking"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                className="flex-1 text-sm p-2.5 border border-ink/15 rounded-xl bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-marigold"
              />
              <button
                type="submit"
                disabled={isAddingCategory || !newCategoryName.trim()}
                className="px-4 py-2.5 bg-pine text-on-pine text-xs font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50"
              >
                {isAddingCategory ? "Adding…" : "Add Category"}
              </button>
            </form>

            <div className="flex flex-wrap gap-2.5">
              {categories.map((cat) => (
                <div
                  key={cat.id}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                    cat.isActive
                      ? "border-ink/12 bg-paper text-ink shadow-soft"
                      : "border-ink/8 bg-ink/[0.03] text-ink/45"
                  }`}
                >
                  {editingCatId === cat.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="text"
                        value={editingCatName}
                        onChange={(e) => setEditingCatName(e.target.value)}
                        className="w-28 text-xs px-2 py-0.5 border border-marigold rounded bg-paper text-ink"
                      />
                      <button
                        type="button"
                        onClick={() => handleRenameCategory(cat.id)}
                        className="text-[11px] font-semibold text-pine"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCatId(null)}
                        className="text-ink/45"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <>
                      <span className="font-semibold">{cat.name}</span>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setEditingCatName(cat.name);
                        }}
                        className="p-0.5 text-ink/40 hover:text-ink"
                        title="Rename category"
                        aria-label="Rename category"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleCategoryActive(cat)}
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                          cat.isActive
                            ? "bg-pine/10 text-pine hover:bg-pine/20"
                            : "bg-ink/10 text-ink/60 hover:bg-ink/20"
                        }`}
                      >
                        {cat.isActive ? "Active" : "Archived"}
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* 3. SLA Target Hours Matrix */}
          <section className="space-y-4 pt-4 border-t border-ink/8">
            <div>
              <h2 className="text-base font-semibold text-ink">
                SLA Deadlines (Target Hours)
              </h2>
              <p className="text-xs text-ink/55">
                How quickly each category should be fixed by severity. Edit any
                number and click Save.
              </p>
            </div>

            {activeCategories.length === 0 ? (
              <div className="rounded-2xl border border-ink/10 p-6 bg-paper text-xs text-ink/55">
                Create an active category above to customize its SLA deadlines.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-paper shadow-soft">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-ink/8 bg-ink/[0.03] text-ink/60">
                      <th className="p-3.5 font-semibold">Category</th>
                      {SEVERITIES.map((s) => (
                        <th key={s.key} className="p-3.5 font-semibold">
                          {s.label} (hrs)
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/8">
                    {activeCategories.map((cat) => (
                      <tr key={cat.id}>
                        <td className="p-3.5 font-semibold text-ink">
                          {cat.name}
                        </td>
                        {SEVERITIES.map((sev) => {
                          const cellKey = `${cat.id}:${sev.key}`;
                          const val =
                            slaDrafts[cellKey] ?? String(sev.defaultHours);
                          const isSaving = savingCellKey === cellKey;
                          const isSaved = savedCellKey === cellKey;
                          return (
                            <td key={sev.key} className="p-3.5">
                              <div className="inline-flex items-center gap-1.5">
                                <input
                                  type="number"
                                  min={1}
                                  max={2160}
                                  value={val}
                                  onChange={(e) =>
                                    setSlaDrafts((prev) => ({
                                      ...prev,
                                      [cellKey]: e.target.value,
                                    }))
                                  }
                                  className="w-16 px-2 py-1.5 text-xs border border-ink/15 rounded-lg bg-paper text-ink tabular-nums focus:outline-none focus:border-marigold"
                                />
                                <button
                                  type="button"
                                  disabled={isSaving}
                                  onClick={() =>
                                    handleSaveSlaCell(cat.id, sev.key)
                                  }
                                  className="px-2 py-1.5 rounded-lg border border-ink/12 bg-ink/[0.03] hover:bg-ink/[0.08] text-[11px] font-semibold text-ink/75 transition-colors"
                                >
                                  {isSaving ? (
                                    <Loader2
                                      size={11}
                                      className="animate-spin"
                                    />
                                  ) : isSaved ? (
                                    <Check size={11} className="text-pine" />
                                  ) : (
                                    "Save"
                                  )}
                                </button>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
