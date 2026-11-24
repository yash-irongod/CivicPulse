// Admin Residents & Flats Management Page.
// Allows committee admins to manage residents, onboard new flats, and issue one-time claim invite links.

"use client";

import React, { useCallback, useEffect, useState } from "react";

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

  // New space form state
  const [addSpaceName, setAddSpaceName] = useState("");
  const [isAddingSpace, setIsAddingSpace] = useState(false);

  // Action status (reissue, revoke, copy)
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
        text: `New invite link generated and copied to clipboard!`,
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
    if (
      !confirm(
        "Revoke this invite? The resident will not be able to use the link.",
      )
    )
      return;
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
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-ink/10 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-ink/60">
            <span className="w-2 h-2 rounded-full bg-pine" />
            <span>{communityName}</span>
          </div>
          <h1 className="text-xl font-bold text-ink tracking-tight mt-0.5">
            Residents & Flats Directory
          </h1>
          <p className="text-xs text-ink/60 mt-0.5">
            Invite residents to their flats with one-time claim links. No
            repeated logins needed.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              setInviteResult(null);
              setShowInviteModal(true);
            }}
            className="px-4 py-2 bg-pine text-on-pine text-xs font-bold hover:bg-pine/90 shadow-sm flex items-center gap-1.5 transition-all"
          >
            <span>+</span>
            <span>Invite Resident</span>
          </button>
        </div>
      </div>

      {/* KPI Stats Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3 bg-paper border border-ink/15 shadow-xs">
          <div className="text-[10px] uppercase font-bold text-ink/50 tracking-wider">
            Total Residents
          </div>
          <div className="text-2xl font-bold text-ink font-mono mt-0.5">
            {entries.length}
          </div>
        </div>
        <div className="p-3 bg-paper border border-ink/15 shadow-xs">
          <div className="text-[10px] uppercase font-bold text-pine tracking-wider">
            Active on App
          </div>
          <div className="text-2xl font-bold text-pine font-mono mt-0.5">
            {claimedCount}
          </div>
        </div>
        <div className="p-3 bg-paper border border-ink/15 shadow-xs">
          <div className="text-[10px] uppercase font-bold text-marigold tracking-wider">
            Pending Invites
          </div>
          <div className="text-2xl font-bold text-marigold font-mono mt-0.5">
            {pendingCount}
          </div>
        </div>
        <div className="p-3 bg-paper border border-ink/15 shadow-xs">
          <div className="text-[10px] uppercase font-bold text-ink/50 tracking-wider">
            Total Flats / Spaces
          </div>
          <div className="text-2xl font-bold text-ink font-mono mt-0.5">
            {spaces.length}
          </div>
        </div>
      </div>

      {/* Alerts */}
      {actionMessage && (
        <div
          className={`p-3 text-xs border-l-4 font-medium ${
            actionMessage.type === "success"
              ? "bg-pine/10 border-pine text-pine"
              : "bg-brick/10 border-brick text-brick"
          }`}
        >
          {actionMessage.text}
        </div>
      )}

      {error && (
        <div className="p-3 bg-brick/10 border-l-4 border-brick text-xs text-brick font-mono">
          {error}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-ink/15 gap-6 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setActiveTab("residents")}
          className={`pb-2.5 transition-colors relative ${
            activeTab === "residents"
              ? "text-ink border-b-2 border-marigold"
              : "text-ink/50 hover:text-ink"
          }`}
        >
          Residents ({entries.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("spaces")}
          className={`pb-2.5 transition-colors relative ${
            activeTab === "spaces"
              ? "text-ink border-b-2 border-marigold"
              : "text-ink/50 hover:text-ink"
          }`}
        >
          Flats & Spaces ({spaces.length})
        </button>
      </div>

      {/* Loading state */}
      {isLoading ? (
        <div className="space-y-3 animate-pulse">
          <div className="h-10 bg-ink/5 rounded" />
          <div className="h-10 bg-ink/5 rounded" />
          <div className="h-10 bg-ink/5 rounded" />
        </div>
      ) : activeTab === "residents" ? (
        /* Residents Tab Content */
        <div className="space-y-4">
          {entries.length === 0 ? (
            <div className="p-8 border border-dashed border-ink/20 bg-paper text-center space-y-2">
              <p className="text-sm font-semibold text-ink">
                No residents onboarded yet
              </p>
              <p className="text-xs text-ink/60 max-w-sm mx-auto">
                Click &ldquo;+ Invite Resident&rdquo; above to generate your
                first resident invite link.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto border border-ink/15 bg-paper shadow-xs">
              <table className="w-full text-left text-xs">
                <thead className="bg-ink/5 border-b border-ink/10 text-[10px] font-bold uppercase tracking-wider text-ink/60">
                  <tr>
                    <th className="py-2.5 px-3">Resident Name</th>
                    <th className="py-2.5 px-3">Flat / Unit</th>
                    <th className="py-2.5 px-3">Phone</th>
                    <th className="py-2.5 px-3">Language</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10 font-sans">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-ink/[0.02]">
                      <td className="py-3 px-3 font-semibold text-ink">
                        {entry.displayName}
                      </td>
                      <td className="py-3 px-3 font-mono text-ink/80">
                        {entry.spaceName || "—"}
                      </td>
                      <td className="py-3 px-3 font-mono text-ink/60">
                        {entry.phone || "—"}
                      </td>
                      <td className="py-3 px-3 uppercase text-[10px] font-mono text-ink/60">
                        {entry.preferredLanguage}
                      </td>
                      <td className="py-3 px-3">
                        {entry.status === "claimed" ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-pine/10 text-pine border border-pine/20">
                            ✓ Active on App
                          </span>
                        ) : entry.status === "pending" ? (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-bold bg-marigold/10 text-marigold border border-marigold/20">
                            Pending Invite
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-ink/10 text-ink/50">
                            Revoked
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right space-x-2">
                        {entry.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleReissue(entry.id)}
                              className="text-[11px] font-semibold text-marigold hover:underline"
                            >
                              {copiedId === entry.id
                                ? "✓ Copied!"
                                : "Copy Link"}
                            </button>
                            <span className="text-ink/20">·</span>
                            <button
                              type="button"
                              onClick={() => handleRevoke(entry.id)}
                              className="text-[11px] text-brick hover:underline"
                            >
                              Revoke
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleReissue(entry.id)}
                            className="text-[11px] text-ink/60 hover:text-ink hover:underline"
                            title="Generate a new login link if resident lost device"
                          >
                            Reissue Access Link
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
        /* Flats & Spaces Tab Content */
        <div className="space-y-6">
          {/* Add Flat Quick Form */}
          <form
            onSubmit={handleAddSpace}
            className="p-4 border border-ink/15 bg-paper space-y-3 shadow-xs max-w-lg"
          >
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink/70">
              Add New Flat or Common Area
            </h3>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Flat 304, Tower B or Clubhouse"
                value={addSpaceName}
                onChange={(e) => setAddSpaceName(e.target.value)}
                className="flex-1 text-xs p-2.5 border border-ink/20 bg-paper text-ink focus:outline-none focus:border-marigold"
              />
              <button
                type="submit"
                disabled={isAddingSpace || !addSpaceName.trim()}
                className="px-4 py-2 bg-pine text-on-pine text-xs font-bold hover:bg-pine/90 disabled:opacity-50"
              >
                {isAddingSpace ? "Adding..." : "Add Flat"}
              </button>
            </div>
          </form>

          {/* Spaces List */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5">
            {spaces.map((s) => (
              <div
                key={s.id}
                className="p-3 border border-ink/15 bg-paper flex items-center justify-between text-xs"
              >
                <span className="font-semibold text-ink font-mono">
                  {s.name}
                </span>
                <span className="text-[10px] text-ink/40">Unit</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Invite Modal */}
      {showInviteModal && (
        <div className="fixed inset-0 bg-ink/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
          <div className="bg-paper border border-ink/20 p-6 max-w-md w-full shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h2 className="text-base font-bold text-ink">
                Invite Resident to {communityName}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setShowInviteModal(false);
                  setInviteResult(null);
                }}
                className="text-xs text-ink/50 hover:text-ink font-bold"
              >
                ✕
              </button>
            </div>

            {!inviteResult ? (
              <form
                onSubmit={handleCreateInvite}
                className="space-y-3.5 text-xs"
              >
                <div className="space-y-1">
                  <label className="font-semibold text-ink/70 block">
                    Resident Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Sharma Ji"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full p-2.5 border border-ink/20 bg-paper text-ink focus:outline-none focus:border-marigold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-ink/70 block">
                    Flat / Unit Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Flat 101 or select below"
                    value={newSpaceName}
                    onChange={(e) => setNewSpaceName(e.target.value)}
                    list="spaces-datalist"
                    className="w-full p-2.5 border border-ink/20 bg-paper text-ink focus:outline-none focus:border-marigold"
                  />
                  <datalist id="spaces-datalist">
                    {spaces.map((s) => (
                      <option key={s.id} value={s.name} />
                    ))}
                  </datalist>
                  <span className="text-[10px] text-ink/50 block">
                    Type a new flat name or pick an existing flat from the list.
                  </span>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-ink/70 block">
                    Phone Number (optional)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 9876543210"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                    className="w-full p-2.5 border border-ink/20 bg-paper text-ink focus:outline-none focus:border-marigold"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-ink/70 block">
                    Preferred Language
                  </label>
                  <div className="flex gap-4 pt-1">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="lang"
                        value="en"
                        checked={newLang === "en"}
                        onChange={() => setNewLang("en")}
                      />
                      <span>English</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="lang"
                        value="hi"
                        checked={newLang === "hi"}
                        onChange={() => setNewLang("hi")}
                      />
                      <span>हिंदी (Hindi)</span>
                    </label>
                  </div>
                </div>

                <div className="pt-3 flex gap-2">
                  <button
                    type="submit"
                    disabled={isSubmitting || !newName.trim()}
                    className="flex-1 py-2.5 bg-pine text-on-pine font-bold text-xs hover:bg-pine/90 disabled:opacity-50"
                  >
                    {isSubmitting
                      ? "Generating Link..."
                      : "Create & Generate Invite"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 text-xs text-ink/60 hover:text-ink"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              /* Success / Result State with Copy & WhatsApp share */
              <div className="space-y-4">
                <div className="p-3 bg-pine/10 border-l-4 border-pine space-y-1">
                  <div className="font-bold text-pine text-xs">
                    ✓ Invite Created for {inviteResult.displayName}!
                  </div>
                  <p className="text-[11px] text-ink/70 leading-relaxed">
                    Send this link to the resident. Once they open it on their
                    phone, they are permanently logged in on that device.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase font-bold text-ink/50 tracking-wider block">
                    One-Time Claim Link
                  </label>
                  <div className="p-2.5 bg-ink/5 border border-ink/15 font-mono text-xs break-all text-ink select-all">
                    {inviteResult.claimUrl}
                  </div>
                </div>

                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={async () => {
                      await navigator.clipboard.writeText(
                        inviteResult.claimUrl,
                      );
                      alert("Invite link copied to clipboard!");
                    }}
                    className="flex-1 py-2.5 bg-marigold text-on-marigold font-bold text-xs hover:bg-marigold/90"
                  >
                    📋 Copy Link
                  </button>
                  <a
                    href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                      `Hello! Here is your private invitation link to join ${communityName} maintenance portal on Nivas:\n\n${inviteResult.claimUrl}\n\nTap the link to activate your access.`,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 bg-[#25D366] text-white font-bold text-xs text-center hover:opacity-90 flex items-center justify-center gap-1.5"
                  >
                    <span>💬</span>
                    <span>Share on WhatsApp</span>
                  </a>
                </div>

                <div className="pt-2 border-t border-ink/10 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowInviteModal(false);
                      setInviteResult(null);
                    }}
                    className="px-4 py-2 text-xs text-ink/60 hover:text-ink font-semibold"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
