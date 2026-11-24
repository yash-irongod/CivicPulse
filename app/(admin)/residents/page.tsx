// Admin Residents & Flats Management Page.
// Clean directory, animated tabs, elevated invite modal with copy & WhatsApp share.

"use client";

import React, { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UserPlus,
  Check,
  Copy,
  MessageSquare,
  X,
  Building2,
  Users,
  CircleAlert,
  CheckCircle2,
  Loader2,
} from "@/components/shared/icons";

interface RosterEntry {
  id: string;
  displayName: string;
  phone: string | null;
  preferredLanguage: string;
  status: "pending" | "claimed" | "revoked";
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

export default function AdminResidentsPage() {
  const [communityName, setCommunityName] = useState("Society");
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"residents" | "spaces">(
    "residents",
  );

  // Invite modal state
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newSpaceName, setNewSpaceName] = useState("");
  const [newLang, setNewLang] = useState<"en" | "hi">("en");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inviteResult, setInviteResult] = useState<{
    displayName: string;
    claimUrl: string;
    expiresAt: string;
  } | null>(null);
  const [modalCopied, setModalCopied] = useState(false);

  // Inline revoke confirmation state (replaces native browser confirm())
  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);

  // New space form state
  const [addSpaceName, setAddSpaceName] = useState("");
  const [isAddingSpace, setIsAddingSpace] = useState(false);

  // Action status
  const [actionMessage, setActionMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/roster");
      if (!res.ok) throw new Error("Failed to load resident roster.");
      const data = await res.json();
      setCommunityName(data.communityName || "Society");
      setEntries(data.entries || []);
      setSpaces(data.spaces || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading roster.");
    } finally {
      setIsLoading(false);
    }
  }, []);

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
      const res = await fetch("/api/admin/roster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          displayName: newName.trim(),
          phone: newPhone.trim() || undefined,
          spaceName: newSpaceName.trim() || undefined,
          preferredLanguage: newLang,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create invite.");

      setInviteResult({
        displayName: data.entry.displayName,
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

  const handleReissue = async (entryId: string) => {
    setActionMessage(null);
    try {
      const res = await fetch(`/api/admin/roster/${entryId}/reissue`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok)
        throw new Error(data.error || "Failed to reissue claim link.");

      const fullUrl =
        data.claimUrl || `${window.location.origin}${data.claimPath}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedId(entryId);
      setActionMessage({
        text: "Invite link regenerated and copied to clipboard.",
        type: "success",
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
      if (!res.ok) throw new Error("Failed to revoke invite.");
      setActionMessage({ text: "Invite revoked.", type: "success" });
      await fetchData();
    } catch (err) {
      setActionMessage({
        text: err instanceof Error ? err.message : "Error revoking invite.",
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
  const pendingCount = entries.filter((e) => e.status === "pending").length;

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
            Residents & Flats
          </h1>
          <p className="text-sm text-ink/55">
            Onboard residents with one-time claim links — no passwords needed.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setInviteResult(null);
            setModalCopied(false);
            setShowInviteModal(true);
          }}
          className="px-4 py-2.5 bg-pine text-on-pine text-sm font-semibold rounded-xl hover:bg-pine/90 shadow-soft flex items-center justify-center gap-2 transition-all active:scale-[0.98] shrink-0"
        >
          <UserPlus size={16} />
          <span>Invite Resident</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
          <div className="text-xs font-medium text-ink/55">Total Residents</div>
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
            Pending Invites
          </div>
          <div className="text-2xl font-bold text-marigold mt-1 tabular-nums">
            {pendingCount}
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
          className={`flex items-center gap-2.5 p-3.5 text-xs rounded-xl border-l-4 font-medium ${
            actionMessage.type === "success"
              ? "bg-pine/10 border-pine text-pine"
              : "bg-brick/10 border-brick text-brick"
          }`}
        >
          {actionMessage.type === "success" ? (
            <CheckCircle2 size={15} />
          ) : (
            <CircleAlert size={15} />
          )}
          <span>{actionMessage.text}</span>
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
            <span>Residents ({entries.length})</span>
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
          {entries.length === 0 ? (
            <div className="p-10 rounded-2xl border border-dashed border-ink/15 bg-paper text-center space-y-2">
              <Users size={36} className="text-ink/20 mx-auto" />
              <p className="text-sm font-semibold text-ink">
                No residents onboarded yet
              </p>
              <p className="text-xs text-ink/55 max-w-sm mx-auto leading-relaxed">
                Tap &ldquo;Invite Resident&rdquo; above to create your first
                one-time access link.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-paper shadow-soft">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-ink/[0.03] border-b border-ink/8 text-xs font-medium text-ink/60">
                  <tr>
                    <th className="py-3 px-4 font-semibold">Resident Name</th>
                    <th className="py-3 px-4 font-semibold">Flat / Unit</th>
                    <th className="py-3 px-4 font-semibold">Phone</th>
                    <th className="py-3 px-4 font-semibold">Language</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/8 font-sans">
                  {entries.map((entry) => (
                    <tr
                      key={entry.id}
                      className="hover:bg-ink/[0.02] transition-colors"
                    >
                      <td className="py-3.5 px-4 font-semibold text-ink">
                        {entry.displayName}
                      </td>
                      <td className="py-3.5 px-4 text-ink/75">
                        {entry.spaceName || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-ink/60 tabular-nums">
                        {entry.phone || "—"}
                      </td>
                      <td className="py-3.5 px-4 text-ink/65">
                        {entry.preferredLanguage === "hi" ? "Hindi" : "English"}
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
                      <td className="py-3.5 px-4 text-right">
                        {entry.status === "pending" ? (
                          <div className="inline-flex items-center gap-2.5">
                            <button
                              type="button"
                              onClick={() => handleReissue(entry.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-marigold hover:underline"
                            >
                              {copiedId === entry.id ? (
                                <>
                                  <Check size={12} />
                                  <span>Copied</span>
                                </>
                              ) : (
                                <>
                                  <Copy size={12} />
                                  <span>Copy Link</span>
                                </>
                              )}
                            </button>
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
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReissue(entry.id)}
                            className="text-xs text-ink/60 hover:text-ink hover:underline"
                            title="Generate a fresh access link if the resident changed phones"
                          >
                            {copiedId === entry.id
                              ? "New link copied"
                              : "Reissue link"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
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

      {/* Invite Modal */}
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
              className="bg-paper border border-ink/12 rounded-2xl p-6 max-w-md w-full shadow-elevated space-y-5"
            >
              <div className="flex items-center justify-between border-b border-ink/8 pb-3.5">
                <h2 className="text-base font-bold text-ink">
                  Invite Resident to {communityName}
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
                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Resident Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rajesh Sharma"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Flat / Unit Number
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
                    <span className="text-[11px] text-ink/50 block">
                      Type a new flat name or select an existing unit.
                    </span>
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
                      <span>Invite created for {inviteResult.displayName}</span>
                    </div>
                    <p className="text-xs text-ink/70 leading-relaxed">
                      Share this link with the resident. Once they tap it on
                      their phone, their device stays signed in automatically.
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
                        `Hello! Here is your private invitation link to join ${communityName} on Nivas:\n\n${inviteResult.claimUrl}\n\nTap the link to activate your access.`,
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 py-2.5 px-3 bg-pine text-on-pine font-semibold text-xs rounded-xl text-center hover:bg-pine/90 flex items-center justify-center gap-1.5 transition-all"
                    >
                      <MessageSquare size={14} />
                      <span>WhatsApp</span>
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
    </div>
  );
}
