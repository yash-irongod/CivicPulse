// Admin Residents, Staff, Co-Admins & Onboarding Guide Page.
// Supports zero-SQL role/team assignment, Chief Admin transfer, true revocation,
// lost-device recovery links, and sharing the welcome poster in group chats.

"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ShareWelcomePosterModal } from "@/components/admin/share-welcome-poster";
import { useCommunityShell } from "@/components/shared/community-context";
import {
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Crown,
  Download,
  Loader2,
  MessageSquare,
  Pencil,
  Search,
  Share2,
  Shield,
  UserPlus,
  Users,
  Wrench,
  X,
} from "@/components/shared/icons";
import type { Role } from "@/lib/auth/roles";

interface RosterEntry {
  id: string;
  residentId: string | null;
  displayName: string;
  phone: string | null;
  preferredLanguage: string;
  status: "pending" | "claimed" | "revoked";
  role: Role;
  isChiefAdmin: boolean;
  teamId: string | null;
  teamName: string | null;
  expiresAt: string | null;
  claimedAt: string | null;
  createdAt: string;
  spaceId: string | null;
  spaceName: string | null;
}

interface Space {
  id: string;
  name: string;
}

interface TeamOption {
  id: string;
  name: string;
}

const ROLE_LABELS: Record<Role, string> = {
  resident: "Resident",
  maintenance_staff: "Maintenance Worker",
  committee_admin: "Committee Admin",
};

function buildDirectInviteMessage(params: {
  displayName: string;
  communityName: string;
  claimUrl: string;
  role: Role;
  teamName?: string | null;
}): string {
  const { displayName, communityName, claimUrl, role, teamName } = params;
  if (role === "maintenance_staff") {
    return `Hello ${displayName}! Here is your Nivas Staff access link for ${communityName}${
      teamName ? ` (${teamName})` : ""
    }:\n\n${claimUrl}\n\nTap the link to open your My Work checklist.`;
  }
  if (role === "committee_admin") {
    return `Hello ${displayName}! Here is your Nivas Committee Admin access link for ${communityName}:\n\n${claimUrl}\n\nTap the link to open the Admin Console.`;
  }
  return `Hello ${displayName}! Here is your private invitation link to join ${communityName} on Nivas:\n\n${claimUrl}\n\nTap the link to activate your access (no password needed).`;
}

export default function AdminResidentsPage() {
  const { communityName: shellCommunityName, assets } = useCommunityShell();
  const posterUrl =
    assets.residentWelcomePoster ?? "/assets/resident-welcome-poster.jpg";

  const [communityName, setCommunityName] = useState(
    shellCommunityName || "Society",
  );
  const [callerResidentId, setCallerResidentId] = useState<string | null>(null);
  const [callerIsChiefAdmin, setCallerIsChiefAdmin] = useState(false);

  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"residents" | "spaces">(
    "residents",
  );
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const [searchQuery, setSearchQuery] = useState("");

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newLang, setNewLang] = useState<"en" | "hi">("en");
  const [newRole, setNewRole] = useState<Role>("resident");
  const [newTeamId, setNewTeamId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    displayName: string;
    role: Role;
    teamName: string | null;
    claimUrl: string;
    expiresAt: string;
  } | null>(null);
  const [modalCopied, setModalCopied] = useState(false);

  // Edit role/team modal state
  const [editTarget, setEditTarget] = useState<RosterEntry | null>(null);
  const [editRole, setEditRole] = useState<Role>("resident");
  const [editTeamId, setEditTeamId] = useState("");
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  // Share welcome poster modal
  const [showPosterModal, setShowPosterModal] = useState(false);

  // Inline confirmations
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [confirmTransferId, setConfirmTransferId] = useState<string | null>(
    null,
  );

  // New space form state
  const [addSpaceName, setAddSpaceName] = useState("");
  const [isAddingSpace, setIsAddingSpace] = useState(false);

  // Action status + last reissued link for 1-tap WhatsApp resend
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
    whatsappUrl?: string;
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roster");
      if (!res.ok) throw new Error("Failed to load member directory.");
      const data = await res.json();
      setCommunityName(data.communityName || shellCommunityName || "Society");
      setCallerResidentId(data.callerResidentId || null);
      setCallerIsChiefAdmin(Boolean(data.callerIsChiefAdmin));
      setEntries(data.entries || []);
      setSpaces(data.spaces || []);
      setTeams(data.teams || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading directory.");
    } finally {
      setIsLoading(false);
    }
  }, [shellCommunityName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    setIsSubmitting(true);
    setActionMessage(null);
    setModalCopied(false);
    try {
      const selectedTeamId =
        newRole === "maintenance_staff" && newTeamId ? newTeamId : null;

      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: newName.trim(),
          phone: newPhone.trim() || undefined,
          spaceName: newSpaceName.trim() || undefined,
          preferredLanguage: newLang,
          role: newRole,
          teamId: selectedTeamId,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invite.");

      const matchedTeamName = selectedTeamId
        ? (teams.find((t) => t.id === selectedTeamId)?.name ?? null)
        : null;

      setInviteResult({
        displayName: data.entry.displayName,
        role: newRole,
        teamName: matchedTeamName,
        claimUrl: data.entry.claimUrl,
        expiresAt: data.entry.expiresAt,
      });

      setNewName("");
      setNewPhone("");
      setNewSpaceName("");
      await fetchData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Error creating invite.",
        type: "error",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReissue = async (entry: RosterEntry) => {
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/roster/${entry.id}/reissue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to reissue claim link.");

      const fullUrl =
        data.claimUrl || `${window.location.origin}${data.claimPath}`;
      try {
        await navigator.clipboard.writeText(fullUrl);
      } catch {
        // Fallback if clipboard blocked without HTTPS/focus; WhatsApp button still works
      }

      const msg = buildDirectInviteMessage({
        displayName: entry.displayName,
        communityName,
        claimUrl: fullUrl,
        role: entry.role,
        teamName: entry.teamName,
      });

      setCopiedId(entry.id);
      setActionMessage({
        text: `Fresh link created & copied for ${entry.displayName} (works for new devices).`,
        type: "success",
        whatsappUrl: `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`,
      });
      setTimeout(() => setCopiedId(null), 3000);
      await fetchData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Error reissuing link.",
        type: "error",
      });
    }
  };

  const handleRevoke = async (entryId: string) => {
    setConfirmRevokeId(null);
    try {
      const res = await fetch(`/api/admin/roster/${entryId}/revoke`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "cannot_revoke_chief_admin") {
          throw new Error("The Chief Admin cannot be revoked.");
        }
        if (data.error === "cannot_revoke_self") {
          throw new Error("You cannot revoke your own account.");
        }
        throw new Error(data.error || "Failed to revoke access.");
      }
      setActionMessage({
        text: "Access revoked — member can no longer sign in to this society.",
        type: "success",
      });
      await fetchData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Error revoking access.",
        type: "error",
      });
    }
  };

  const handleSaveRole = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    setIsUpdatingRole(true);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/roster/${editTarget.id}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole,
          teamId:
            editRole === "maintenance_staff" && editTeamId ? editTeamId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "cannot_modify_chief_admin"
            ? "Chief Admin role cannot be modified here."
            : data.error || "Failed to update role.",
        );
      }
      setEditTarget(null);
      setActionMessage({
        text: `Updated role & team for ${editTarget.displayName}.`,
        type: "success",
      });
      await fetchData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Error updating role.",
        type: "error",
      });
    } finally {
      setIsUpdatingRole(false);
    }
  };

  const handleTransferChief = async (entry: RosterEntry) => {
    setConfirmTransferId(null);
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/roster/${entry.id}/transfer-chief`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to transfer Chief Admin.");
      }
      setActionMessage({
        text: `${entry.displayName} is now the Chief Admin of ${communityName}.`,
        type: "success",
      });
      await fetchData();
    } catch (err) {
      setActionMessage({
        text:
          err instanceof Error
            ? err.message
            : "Error transferring Chief Admin.",
        type: "error",
      });
    }
  };

  const handleAddSpace = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSpaceName.trim()) return;

    setIsAddingSpace(true);
    setActionMessage(null);
    try {
      const res = await fetch("/api/admin/spaces", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: addSpaceName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error === "already_exists"
            ? "A flat with this name already exists."
            : "Failed to add flat.",
        );
      }
      setAddSpaceName("");
      setActionMessage({
        text: `Flat "${data.space.name}" added successfully.`,
        type: "success",
      });
      await fetchData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Error adding flat.",
        type: "error",
      });
    } finally {
      setIsAddingSpace(false);
    }
  };

  const claimedCount = entries.filter((e) => e.status === "claimed").length;
  const staffCount = entries.filter(
    (e) => e.role === "maintenance_staff" && e.status !== "revoked",
  ).length;

  const filteredEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return entries.filter((entry) => {
      if (roleFilter !== "all" && entry.role !== roleFilter) return false;
      if (!q) return true;
      return (
        entry.displayName.toLowerCase().includes(q) ||
        (entry.spaceName?.toLowerCase().includes(q) ?? false) ||
        (entry.teamName?.toLowerCase().includes(q) ?? false) ||
        (entry.phone?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [entries, roleFilter, searchQuery]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs text-ink/55">
            <span className="w-2 h-2 rounded-full bg-pine" />
            <span>{communityName}</span>
          </div>
          <h1 className="text-2xl font-bold text-ink tracking-tight">
            Members, Staff & Flats
          </h1>
          <p className="text-sm text-ink/55">
            Onboard residents, maintenance workers, and co-admins — zero SQL or
            passwords needed.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setShowPosterModal(true)}
            className="px-3.5 py-2.5 bg-paper border border-ink/12 text-ink text-xs sm:text-sm font-semibold rounded-xl hover:bg-ink/[0.04] shadow-soft flex items-center justify-center gap-2 transition-all"
          >
            <Share2 size={15} className="text-marigold" />
            <span>Share Guide in GC</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setInviteResult(null);
              setModalCopied(false);
              setNewRole("resident");
              setNewTeamId(teams[0]?.id || "");
              setShowInviteModal(true);
            }}
            className="px-4 py-2.5 bg-pine text-on-pine text-xs sm:text-sm font-semibold rounded-xl hover:bg-pine/90 shadow-soft flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
          >
            <UserPlus size={16} />
            <span>Invite Member</span>
          </button>
        </div>
      </div>

      {/* Onboarding Poster Broadcast Strip */}
      <section className="rounded-2xl border border-ink/10 bg-paper p-4 sm:p-5 shadow-soft flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <button
            type="button"
            onClick={() => setShowPosterModal(true)}
            className="w-16 h-20 rounded-xl overflow-hidden border border-ink/12 shrink-0 bg-ink/5 hover:opacity-90 transition-opacity"
            title="Preview & share welcome poster"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={posterUrl}
              alt="Resident 3-step onboarding poster thumbnail"
              className="w-full h-full object-cover object-top"
            />
          </button>
          <div className="space-y-1 min-w-0">
            <div className="text-sm font-bold text-ink">
              Resident Welcome Poster for Society GCs
            </div>
            <p className="text-xs text-ink/60 leading-relaxed max-w-xl">
              Announce Nivas in your existing WhatsApp, Telegram, Instagram, or
              Facebook groups before DMing personal invite links — includes the
              3-step join & app-install visual.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowPosterModal(true)}
            className="px-3.5 py-2 rounded-xl bg-marigold text-on-marigold text-xs font-semibold hover:bg-marigold/90 flex items-center gap-1.5 transition-all"
          >
            <Share2 size={14} />
            <span>Share in Group</span>
          </button>
          <a
            href={posterUrl}
            download="nivas-resident-guide.jpg"
            className="p-2 rounded-xl border border-ink/12 bg-paper hover:bg-ink/[0.04] text-ink/70 hover:text-ink transition-colors"
            title="Download poster"
            aria-label="Download poster"
          >
            <Download size={15} />
          </a>
        </div>
      </section>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
          <div className="text-xs font-medium text-ink/55">Total Directory</div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {entries.length}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
          <div className="text-xs font-medium text-pine">Active on App</div>
          <div className="text-2xl font-bold text-pine mt-1 tabular-nums">
            {claimedCount}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
          <div className="text-xs font-medium text-marigold">
            Maintenance Staff
          </div>
          <div className="text-2xl font-bold text-marigold mt-1 tabular-nums">
            {staffCount}
          </div>
        </div>
        <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
          <div className="text-xs font-medium text-ink/55">Flats & Areas</div>
          <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
            {spaces.length}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {actionMessage && (
        <div
          className={`flex flex-wrap items-center justify-between gap-3 p-3.5 text-xs rounded-xl border-l-4 font-medium ${
            actionMessage.type === "success"
              ? "bg-pine/10 border-pine text-pine"
              : "bg-brick/10 border-brick text-brick"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionMessage.type === "success" ? (
              <CheckCircle2 size={15} />
            ) : (
              <CircleAlert size={15} />
            )}
            <span>{actionMessage.text}</span>
          </div>
          {actionMessage.whatsappUrl && (
            <a
              href={actionMessage.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-pine text-on-pine text-[11px] font-semibold hover:bg-pine/90"
            >
              <MessageSquare size={12} />
              <span>Send on WhatsApp</span>
            </a>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3.5 bg-brick/10 border-l-4 border-brick rounded-xl text-xs text-brick font-medium">
          <CircleAlert size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Animated Pill Tab Navigation */}
      <div className="inline-flex items-center gap-1 p-1 rounded-full bg-ink/[0.04] border border-ink/8">
        <button
          type="button"
          onClick={() => setActiveTab("residents")}
          className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
            activeTab === "residents"
              ? "text-paper"
              : "text-ink/65 hover:text-ink"
          }`}
        >
          {activeTab === "residents" && (
            <motion.span
              layoutId="roster-tab-pill"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute inset-0 rounded-full bg-ink"
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <Users size={13} />
            <span>Directory ({entries.length})</span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("spaces")}
          className={`relative px-4 py-1.5 text-xs font-medium rounded-full transition-colors ${
            activeTab === "spaces" ? "text-paper" : "text-ink/65 hover:text-ink"
          }`}
        >
          {activeTab === "spaces" && (
            <motion.span
              layoutId="roster-tab-pill"
              transition={{ type: "spring", stiffness: 420, damping: 32 }}
              className="absolute inset-0 rounded-full bg-ink"
            />
          )}
          <span className="relative z-10 flex items-center gap-1.5">
            <Building2 size={13} />
            <span>Flats & Spaces ({spaces.length})</span>
          </span>
        </button>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-12 bg-ink/6 rounded-xl" />
          <div className="h-12 bg-ink/6 rounded-xl" />
          <div className="h-12 bg-ink/6 rounded-xl" />
        </div>
      ) : activeTab === "residents" ? (
        <div className="space-y-4">
          {entries.length > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { key: "all", label: "All" },
                    { key: "resident", label: "Residents" },
                    { key: "maintenance_staff", label: "Staff" },
                    { key: "committee_admin", label: "Admins" },
                  ] as const
                ).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setRoleFilter(item.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      roleFilter === item.key
                        ? "bg-ink text-paper"
                        : "bg-ink/[0.05] text-ink/65 hover:text-ink"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="relative sm:w-64">
                <Search
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/40"
                />
                <input
                  type="search"
                  placeholder="Search name, flat, or team…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs border border-ink/12 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                />
              </div>
            </div>
          )}

          {entries.length === 0 ? (
            <div className="p-10 rounded-2xl border border-dashed border-ink/15 bg-paper text-center space-y-2">
              <Users size={36} className="text-ink/20 mx-auto" />
              <p className="text-sm font-semibold text-ink">
                No members onboarded yet
              </p>
              <p className="text-xs text-ink/55 max-w-sm mx-auto leading-relaxed">
                Tap &ldquo;Invite Member&rdquo; above to generate your first
                access link for a resident, worker, or co-admin.
              </p>
            </div>
          ) : filteredEntries.length === 0 ? (
            <div className="p-8 rounded-2xl border border-ink/10 bg-paper text-center text-xs text-ink/55">
              No matching members found for this filter.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-paper shadow-soft">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-ink/[0.03] border-b border-ink/8 text-xs font-medium text-ink/60">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Member & Role</th>
                    <th className="py-3 px-4 font-semibold">Flat / Unit</th>
                    <th className="py-3 px-4 font-semibold">Phone</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8 font-sans">
                  {filteredEntries.map((entry) => {
                    const isSelf =
                      Boolean(callerResidentId) &&
                      entry.residentId === callerResidentId;
                    const canManageMember =
                      !isSelf &&
                      !entry.isChiefAdmin &&
                      entry.status !== "revoked";
                    const canTransferChief =
                      callerIsChiefAdmin &&
                      entry.status === "claimed" &&
                      Boolean(entry.residentId) &&
                      !entry.isChiefAdmin &&
                      !isSelf;

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-ink/[0.02] transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-ink">
                              {entry.displayName}
                            </span>
                            {isSelf && (
                              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink/8 text-ink/60">
                                You
                              </span>
                            )}
                            {entry.isChiefAdmin ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-marigold/15 text-marigold">
                                <Crown size={11} />
                                <span>Chief Admin</span>
                              </span>
                            ) : entry.role === "committee_admin" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink/8 text-ink/80">
                                <Shield size={11} />
                                <span>Co-Admin</span>
                              </span>
                            ) : entry.role === "maintenance_staff" ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-marigold/10 text-marigold">
                                <Wrench size={11} />
                                <span>
                                  Staff
                                  {entry.teamName
                                    ? ` · ${entry.teamName}`
                                    : " · No team"}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink/[0.04] text-ink/55">
                                Resident
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-ink/75">
                          {entry.spaceName || "—"}
                        </td>
                        <td className="py-3.5 px-4 text-ink/60 tabular-nums">
                          {entry.phone || "—"}
                        </td>
                        <td className="py-3.5 px-4">
                          {entry.status === "claimed" ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-pine/10 text-pine">
                              <Check size={11} />
                              <span>Active</span>
                            </span>
                          ) : entry.status === "pending" ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-marigold/10 text-marigold">
                              Pending invite
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-ink/8 text-ink/50">
                              Revoked
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-2.5">
                            {canTransferChief &&
                              (confirmTransferId === entry.id ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-marigold/12">
                                  <span className="text-[11px] text-ink/75">
                                    Make Chief?
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleTransferChief(entry)}
                                    className="text-[11px] font-semibold text-marigold hover:underline"
                                  >
                                    Yes
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmTransferId(null)}
                                    className="text-[11px] text-ink/50 hover:text-ink"
                                  >
                                    No
                                  </button>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmTransferId(entry.id)}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-marigold hover:underline"
                                  title="Transfer Chief Admin privilege"
                                >
                                  <Crown size={11} />
                                  <span>Transfer Chief</span>
                                </button>
                              ))}

                            {canManageMember && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEditTarget(entry);
                                  setEditRole(entry.role);
                                  setEditTeamId(
                                    entry.teamId || teams[0]?.id || "",
                                  );
                                }}
                                className="inline-flex items-center gap-1 text-xs font-medium text-ink/65 hover:text-ink hover:underline"
                              >
                                <Pencil size={11} />
                                <span>Role</span>
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => handleReissue(entry)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-marigold hover:underline"
                              title="Generate & copy a fresh 30-day access link (supports lost-phone recovery)"
                            >
                              {copiedId === entry.id ? (
                                <>
                                  <Check size={12} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>
                                    {entry.status === "pending"
                                      ? "New Link"
                                      : "Reissue"}
                                  </span>
                                </>
                              )}
                            </button>

                            {canManageMember && (
                              <>
                                <span className="text-ink/20">|</span>
                                {confirmRevokeId === entry.id ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <button
                                      type="button"
                                      onClick={() => handleRevoke(entry.id)}
                                      className="text-xs font-semibold text-brick hover:underline"
                                    >
                                      Confirm
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmRevokeId(null)}
                                      className="text-xs text-ink/50 hover:text-ink"
                                    >
                                      Cancel
                                    </button>
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmRevokeId(entry.id)}
                                    className="text-xs text-brick/80 hover:text-brick hover:underline"
                                  >
                                    Revoke
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Add Flat Quick Form */}
          <form
            onSubmit={handleAddSpace}
            className="rounded-2xl p-5 border border-ink/10 bg-paper space-y-3 shadow-soft max-w-lg"
          >
            <h3 className="text-sm font-semibold text-ink">
              Add Flat or Common Area
            </h3>
            <div className="flex gap-2.5">
              <input
                type="text"
                placeholder="e.g. Flat 304, Tower B or Clubhouse"
                value={addSpaceName}
                onChange={(e) => setAddSpaceName(e.target.value)}
                className="flex-1 text-sm p-2.5 border border-ink/15 rounded-xl bg-paper text-ink placeholder:text-ink/35 focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
              />
              <button
                type="submit"
                disabled={isAddingSpace || !addSpaceName.trim()}
                className="px-4 py-2.5 bg-pine text-on-pine text-xs font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50 transition-all"
              >
                {isAddingSpace ? "Adding…" : "Add Flat"}
              </button>
            </div>
          </form>

          {/* Spaces Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {spaces.map((s) => (
              <div
                key={s.id}
                className="p-3.5 rounded-xl border border-ink/10 bg-paper flex items-center justify-between text-xs shadow-soft"
              >
                <span className="font-semibold text-ink truncate pr-2">
                  {s.name}
                </span>
                <span className="text-[11px] text-ink/45 shrink-0">Unit</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Member Modal */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => {
              setShowInviteModal(false);
              setInviteResult(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => e.stopPropagation()}
              className="bg-paper border border-ink/12 rounded-2xl p-6 max-w-md w-full shadow-elevated space-y-5 max-h-[92vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-ink/8 pb-3.5">
                <h2 className="text-base font-bold text-ink">
                  Invite to {communityName}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowInviteModal(false);
                    setInviteResult(null);
                  }}
                  className="p-1.5 text-ink/50 hover:text-ink rounded-lg hover:bg-ink/5 transition-colors"
                  aria-label="Close modal"
                >
                  <X size={16} />
                </button>
              </div>

              {!inviteResult ? (
                <form
                  onSubmit={handleCreateInvite}
                  className="space-y-4 text-xs"
                >
                  {/* Role Selector Pills */}
                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Member Role *
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(
                        [
                          { role: "resident", label: "Resident" },
                          { role: "maintenance_staff", label: "Worker" },
                          { role: "committee_admin", label: "Co-Admin" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.role}
                          type="button"
                          onClick={() => {
                            setNewRole(opt.role);
                            if (
                              opt.role === "maintenance_staff" &&
                              !newTeamId &&
                              teams[0]
                            ) {
                              setNewTeamId(teams[0].id);
                            }
                          }}
                          className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                            newRole === opt.role
                              ? "border-marigold bg-marigold/12 text-ink"
                              : "border-ink/12 bg-paper text-ink/60 hover:text-ink"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {newRole === "maintenance_staff" && (
                    <div className="space-y-1.5 p-3 rounded-xl bg-marigold/8 border border-marigold/20">
                      <label className="font-semibold text-ink block">
                        Assign Maintenance Team *
                      </label>
                      {teams.length === 0 ? (
                        <p className="text-[11px] text-ink/70 leading-relaxed">
                          No teams created yet.{" "}
                          <Link
                            href="/teams"
                            className="font-semibold text-marigold hover:underline"
                          >
                            Create a team in Teams →
                          </Link>{" "}
                          so this worker sees assigned jobs in My Work.
                        </p>
                      ) : (
                        <>
                          <select
                            value={newTeamId}
                            onChange={(e) => setNewTeamId(e.target.value)}
                            className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                          >
                            <option value="">Select team (optional)…</option>
                            {teams.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name}
                              </option>
                            ))}
                          </select>
                          <p className="text-[11px] text-ink/60">
                            Worker automatically joins this team upon tapping
                            Join.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {newRole === "committee_admin" && (
                    <div className="p-3 rounded-xl bg-ink/[0.04] border border-ink/10 text-[11px] text-ink/70 leading-relaxed">
                      Committee Admins can manage residents, assign workers,
                      verify repairs, and view society analytics.
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder={
                        newRole === "maintenance_staff"
                          ? "e.g. Ramesh Electrician"
                          : "e.g. Rajesh Sharma"
                      }
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      {newRole === "resident"
                        ? "Flat / Unit Number"
                        : "Flat / Area (optional)"}
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Flat 101 or pick from list"
                      value={newSpaceName}
                      onChange={(e) => setNewSpaceName(e.target.value)}
                      list="spaces-datalist"
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                    />
                    <datalist id="spaces-datalist">
                      {spaces.map((s) => (
                        <option key={s.id} value={s.name} />
                      ))}
                    </datalist>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Phone Number (optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Preferred Language
                    </label>
                    <div className="flex gap-4 pt-1">
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name="lang"
                          value="en"
                          checked={newLang === "en"}
                          onChange={() => setNewLang("en")}
                        />
                        <span>English</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer text-sm">
                        <input
                          type="radio"
                          name="lang"
                          value="hi"
                          checked={newLang === "hi"}
                          onChange={() => setNewLang("hi")}
                        />
                        <span>हिन्दी (Hindi)</span>
                      </label>
                    </div>
                  </div>

                  <div className="pt-2 flex gap-2.5">
                    <button
                      type="submit"
                      disabled={isSubmitting || !newName.trim()}
                      className="flex-1 py-3 bg-pine text-on-pine font-semibold text-sm rounded-xl hover:bg-pine/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Generating…</span>
                        </>
                      ) : (
                        <span>Create Invite Link</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowInviteModal(false)}
                      className="px-4 py-3 text-sm font-medium text-ink/60 hover:text-ink rounded-xl hover:bg-ink/5 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <div className="space-y-4">
                  <div className="p-3.5 rounded-xl bg-pine/10 border-l-4 border-pine space-y-1">
                    <div className="font-semibold text-pine text-xs flex items-center gap-1.5">
                      <CheckCircle2 size={14} />
                      <span>
                        {ROLE_LABELS[inviteResult.role]} invite for{" "}
                        {inviteResult.displayName}
                      </span>
                    </div>
                    <p className="text-xs text-ink/70 leading-relaxed">
                      Send this private link in a direct message. Once they tap
                      it on their phone, they stay signed in automatically
                      {inviteResult.teamName
                        ? ` with ${inviteResult.teamName}`
                        : ""}
                      .
                    </p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-ink/60 block">
                      One-Time Access Link
                    </label>
                    <div className="p-3 rounded-xl bg-ink/[0.04] border border-ink/10 font-mono text-xs break-all text-ink select-all">
                      {inviteResult.claimUrl}
                    </div>
                  </div>

                  <div className="flex gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(
                          inviteResult.claimUrl,
                        );
                        setModalCopied(true);
                        setTimeout(() => setModalCopied(false), 3000);
                      }}
                      className="flex-1 py-2.5 px-3 bg-marigold text-on-marigold font-semibold text-xs rounded-xl hover:bg-marigold/90 flex items-center justify-center gap-1.5 transition-all"
                    >
                      {modalCopied ? <Check size={14} /> : <Copy size={14} />}
                      <span>{modalCopied ? "Copied!" : "Copy Link"}</span>
                    </button>
                    <a
                      href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                        buildDirectInviteMessage({
                          displayName: inviteResult.displayName,
                          communityName,
                          claimUrl: inviteResult.claimUrl,
                          role: inviteResult.role,
                          teamName: inviteResult.teamName,
                        }),
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-3 bg-pine text-on-pine font-semibold text-xs rounded-xl text-center hover:bg-pine/90 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare size={14} />
                      <span>WhatsApp DM</span>
                    </a>
                  </div>

                  <div className="pt-2 border-t border-ink/8 flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setShowInviteModal(false);
                        setInviteResult(null);
                      }}
                      className="px-4 py-2 text-xs text-ink/65 hover:text-ink font-semibold rounded-xl hover:bg-ink/5 transition-colors"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Role / Team Modal */}
      <AnimatePresence>
        {editTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="fixed inset-0 bg-ink/40 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setEditTarget(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-paper border border-ink/12 rounded-2xl p-6 max-w-md w-full shadow-elevated space-y-5"
            >
              <div className="flex items-center justify-between border-b border-ink/8 pb-3.5">
                <h2 className="text-base font-bold text-ink">
                  Update Access — {editTarget.displayName}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditTarget(null)}
                  className="p-1.5 text-ink/50 hover:text-ink rounded-lg hover:bg-ink/5"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleSaveRole} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-ink/75 block">
                    Role
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(
                      [
                        { role: "resident", label: "Resident" },
                        { role: "maintenance_staff", label: "Worker" },
                        { role: "committee_admin", label: "Co-Admin" },
                      ] as const
                    ).map((opt) => (
                      <button
                        key={opt.role}
                        type="button"
                        onClick={() => setEditRole(opt.role)}
                        className={`py-2 px-2 rounded-xl border text-xs font-semibold transition-all ${
                          editRole === opt.role
                            ? "border-marigold bg-marigold/12 text-ink"
                            : "border-ink/12 bg-paper text-ink/60 hover:text-ink"
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {editRole === "maintenance_staff" && (
                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Maintenance Team
                    </label>
                    <select
                      value={editTeamId}
                      onChange={(e) => setEditTeamId(e.target.value)}
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                    >
                      <option value="">Unassigned</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div className="pt-2 flex gap-2.5">
                  <button
                    type="submit"
                    disabled={isUpdatingRole}
                    className="flex-1 py-2.5 bg-pine text-on-pine font-semibold text-xs rounded-xl hover:bg-pine/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUpdatingRole ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        <span>Saving…</span>
                      </>
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTarget(null)}
                    className="px-4 py-2.5 text-xs font-medium text-ink/60 hover:text-ink rounded-xl hover:bg-ink/5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Share Welcome Poster in Society Groups Modal */}
      <ShareWelcomePosterModal
        isOpen={showPosterModal}
        onClose={() => setShowPosterModal(false)}
        communityName={communityName}
        posterUrl={posterUrl}
      />
    </div>
  );
}
