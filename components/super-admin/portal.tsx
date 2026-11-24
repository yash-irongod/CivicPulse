"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { BrandMark } from "@/components/shared/brand-mark";
import {
  Building2,
  Check,
  CheckCircle2,
  CircleAlert,
  Copy,
  Crown,
  Eye,
  EyeOff,
  Home,
  KeyRound,
  Link2,
  Loader2,
  LogOut,
  MessageSquare,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  UserPlus,
  Users,
  X,
} from "@/components/shared/icons";

interface SocietyAdminRow {
  rosterEntryId: string | null;
  residentId: string | null;
  displayName: string;
  phone: string | null;
  status: string;
  isChiefAdmin: boolean;
  expiresAt: string | null;
}

interface SocietyRecord {
  id: string;
  name: string;
  defaultLanguage: "en" | "hi";
  createdAt: string;
  stats: {
    activeMembers: number;
    openIncidents: number;
    spacesCount: number;
    teamsCount: number;
    categoriesCount: number;
  };
  admins: SocietyAdminRow[];
}

interface GeneratedLinkState {
  title: string;
  subtitle: string;
  societyName: string;
  displayName: string;
  claimUrl: string;
  isChiefAdmin: boolean;
}

interface SuperAdminPortalProps {
  initialConfigured: boolean;
  initialAuthenticated: boolean;
  logoUrl?: string | null;
}

export function SuperAdminPortal({
  initialConfigured,
  initialAuthenticated,
  logoUrl,
}: SuperAdminPortalProps) {
  const [configured] = useState(initialConfigured);
  const [authenticated, setAuthenticated] = useState(initialAuthenticated);
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const [societies, setSocieties] = useState<SocietyRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [banner, setBanner] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  // Create Society modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [socName, setSocName] = useState("");
  const [socLang, setSocLang] = useState<"en" | "hi">("en");
  const [socSpacesText, setSocSpacesText] = useState(
    "Tower A, Tower B, Clubhouse",
  );
  const [seedStarter, setSeedStarter] = useState(true);
  const [chiefName, setChiefName] = useState("");
  const [chiefPhone, setChiefPhone] = useState("");
  const [isCreatingSociety, setIsCreatingSociety] = useState(false);

  // Invite Admin modal for existing society
  const [inviteTarget, setInviteTarget] = useState<SocietyRecord | null>(null);
  const [adminName, setAdminName] = useState("");
  const [adminPhone, setAdminPhone] = useState("");
  const [adminLang, setAdminLang] = useState<"en" | "hi">("en");
  const [adminAsChief, setAdminAsChief] = useState(false);
  const [isInvitingAdmin, setIsInvitingAdmin] = useState(false);

  // Generated invite/recovery link dialog
  const [linkModal, setLinkModal] = useState<GeneratedLinkState | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  const loadSocieties = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/super-admin/communities");
      if (res.status === 401) {
        setAuthenticated(false);
        return;
      }
      if (!res.ok) throw new Error("Failed to load societies.");
      const data = await res.json();
      setSocieties(data.communities || []);
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Could not load societies.",
        type: "error",
      });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      loadSocieties();
    }
  }, [authenticated, loadSocieties]);

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphrase.trim()) return;

    setIsUnlocking(true);
    setAuthError(null);
    try {
      const res = await fetch("/api/super-admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passphrase }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "rate_limited") {
          setAuthError("Too many attempts. Please wait a few minutes.");
        } else if (data.error === "super_admin_not_configured") {
          setAuthError(
            "SUPER_ADMIN_SECRET is not configured cleanly on server.",
          );
        } else {
          setAuthError("Invalid founder passphrase.");
        }
        return;
      }
      setPassphrase("");
      setAuthenticated(true);
    } catch {
      setAuthError("Network error verifying passphrase.");
    } finally {
      setIsUnlocking(false);
    }
  };

  const handleLock = async () => {
    await fetch("/api/super-admin/auth", { method: "DELETE" });
    setAuthenticated(false);
    setSocieties([]);
  };

  const handleCreateSociety = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!socName.trim() || !chiefName.trim()) return;

    setIsCreatingSociety(true);
    setBanner(null);
    try {
      const parsedSpaces = socSpacesText
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await fetch("/api/super-admin/communities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: socName.trim(),
          defaultLanguage: socLang,
          seedStarter,
          initialSpaces: parsedSpaces,
          chiefAdminName: chiefName.trim(),
          chiefAdminPhone: chiefPhone.trim() || undefined,
          chiefAdminLanguage: socLang,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create society.");

      setShowCreateModal(false);
      setSocName("");
      setChiefName("");
      setChiefPhone("");
      await loadSocieties();

      if (data.chiefAdminInvite?.claimUrl) {
        setCopiedLink(false);
        setLinkModal({
          title: `${data.communityName} created`,
          subtitle:
            "Society, starter teams/SLAs, and Chief Admin invite are ready. Send this personal join link to your Chief Admin.",
          societyName: data.communityName,
          displayName: chiefName.trim(),
          claimUrl: data.chiefAdminInvite.claimUrl,
          isChiefAdmin: true,
        });
      }
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Could not create society.",
        type: "error",
      });
    } finally {
      setIsCreatingSociety(false);
    }
  };

  const handleInviteAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteTarget || !adminName.trim()) return;

    setIsInvitingAdmin(true);
    setBanner(null);
    try {
      const res = await fetch("/api/super-admin/admins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: inviteTarget.id,
          displayName: adminName.trim(),
          phone: adminPhone.trim() || undefined,
          preferredLanguage: adminLang,
          isChiefAdmin: adminAsChief,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to invite admin.");

      const targetSociety = inviteTarget;
      const invitedName = adminName.trim();
      const chiefFlag = adminAsChief;

      setInviteTarget(null);
      setAdminName("");
      setAdminPhone("");
      setAdminAsChief(false);
      await loadSocieties();

      setCopiedLink(false);
      setLinkModal({
        title: `Admin invite ready`,
        subtitle: `Send this one-time link to ${invitedName}. Tapping it opens ${targetSociety.name} directly as ${chiefFlag ? "Chief Admin" : "Committee Admin"}.`,
        societyName: targetSociety.name,
        displayName: invitedName,
        claimUrl: data.invite.claimUrl,
        isChiefAdmin: chiefFlag,
      });
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Could not invite admin.",
        type: "error",
      });
    } finally {
      setIsInvitingAdmin(false);
    }
  };

  const handleReissueAdminLink = async (
    societyName: string,
    adminRow: SocietyAdminRow,
  ) => {
    if (!adminRow.rosterEntryId) return;
    setBusyEntryId(adminRow.rosterEntryId);
    setBanner(null);
    try {
      const res = await fetch(
        `/api/super-admin/roster/${adminRow.rosterEntryId}/reissue`,
        { method: "POST" },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reissue link.");

      setCopiedLink(false);
      setLinkModal({
        title: `Recovery link ready for ${adminRow.displayName}`,
        subtitle: `Lost device recovery is enabled for this link. Signing in on a new phone transfers access automatically and locks out the old device.`,
        societyName,
        displayName: adminRow.displayName,
        claimUrl: data.claimUrl,
        isChiefAdmin: adminRow.isChiefAdmin,
      });
      await loadSocieties();
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Could not reissue link.",
        type: "error",
      });
    } finally {
      setBusyEntryId(null);
    }
  };

  const handleMakeChief = async (
    society: SocietyRecord,
    adminRow: SocietyAdminRow,
  ) => {
    if (!adminRow.residentId) return;
    setBusyEntryId(adminRow.residentId);
    setBanner(null);
    try {
      const res = await fetch("/api/super-admin/admins/transfer-chief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          communityId: society.id,
          residentId: adminRow.residentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Transfer failed.");
      setBanner({
        text: `${adminRow.displayName} is now Chief Admin of ${society.name}.`,
        type: "success",
      });
      await loadSocieties();
    } catch (err) {
      setBanner({
        text: err instanceof Error ? err.message : "Could not promote admin.",
        type: "error",
      });
    } finally {
      setBusyEntryId(null);
    }
  };

  // --- Gate screen ---
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-paper text-ink flex flex-col items-center justify-center p-5 font-sans">
        <div className="w-full max-w-md rounded-2xl border border-ink/12 bg-paper p-7 shadow-elevated space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BrandMark logoUrl={logoUrl} variant="dark" size="md" />
              <div>
                <h1 className="text-lg font-bold text-ink tracking-tight">
                  Nivas Founder Console
                </h1>
                <p className="text-xs text-ink/55">
                  Private society & Chief Admin provisioning
                </p>
              </div>
            </div>
            <Link
              href="/"
              className="p-2 rounded-xl text-ink/50 hover:text-ink hover:bg-ink/5 transition-colors"
              aria-label="Back to Home"
            >
              <Home size={16} />
            </Link>
          </div>

          {!configured ? (
            <div className="p-4 rounded-xl bg-marigold/10 border-l-4 border-marigold space-y-2 text-xs text-ink/80 leading-relaxed">
              <div className="font-semibold text-ink flex items-center gap-1.5">
                <KeyRound size={14} className="text-marigold" />
                <span>SUPER_ADMIN_SECRET not configured</span>
              </div>
              <p>
                Add a random 24+ character{" "}
                <code className="px-1.5 py-0.5 rounded bg-ink/8 font-mono text-[11px]">
                  SUPER_ADMIN_SECRET
                </code>{" "}
                to your Vercel Environment Variables (and{" "}
                <code className="px-1.5 py-0.5 rounded bg-ink/8 font-mono text-[11px]">
                  .env.local
                </code>{" "}
                locally), then redeploy to unlock this console.
              </p>
            </div>
          ) : (
            <form onSubmit={handleUnlock} className="space-y-4">
              {authError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-brick/10 border-l-4 border-brick text-xs text-brick font-medium">
                  <CircleAlert size={14} />
                  <span>{authError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-ink/75 block">
                  Founder Passphrase
                </label>
                <div className="relative">
                  <input
                    type={showPassphrase ? "text" : "password"}
                    required
                    autoFocus
                    placeholder="Enter your SUPER_ADMIN_SECRET"
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    className="w-full p-3 pr-10 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassphrase((v) => !v)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 text-ink/45 hover:text-ink"
                    aria-label={
                      showPassphrase ? "Hide passphrase" : "Show passphrase"
                    }
                  >
                    {showPassphrase ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={isUnlocking || !passphrase.trim()}
                className="w-full py-3 bg-ink text-paper text-sm font-semibold rounded-xl hover:bg-ink/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {isUnlocking ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Verifying…</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck size={16} />
                    <span>Unlock Founder Console</span>
                  </>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    );
  }

  const totalMembers = societies.reduce(
    (sum, s) => sum + s.stats.activeMembers,
    0,
  );
  const totalOpenIncidents = societies.reduce(
    (sum, s) => sum + s.stats.openIncidents,
    0,
  );
  const totalAdmins = societies.reduce((sum, s) => sum + s.admins.length, 0);

  return (
    <div className="min-h-screen bg-paper text-ink font-sans flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-30 bg-ink text-paper border-b border-paper/10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark logoUrl={logoUrl} variant="marigold" size="md" />
            <div className="min-w-0">
              <div className="text-sm font-bold tracking-tight truncate">
                Nivas Founder Console
              </div>
              <div className="text-[11px] text-paper/55 truncate">
                Societies · Chief Admins · Recovery Links
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadSocieties}
              disabled={isLoading}
              className="p-2 text-paper/70 hover:text-paper rounded-xl hover:bg-paper/10 transition-colors"
              title="Refresh societies"
              aria-label="Refresh societies"
            >
              <RefreshCw
                size={16}
                className={isLoading ? "animate-spin text-marigold" : ""}
              />
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 bg-marigold text-on-marigold text-xs font-semibold rounded-xl hover:bg-marigold/90 flex items-center gap-1.5 transition-all"
            >
              <Plus size={15} />
              <span>New Society</span>
            </button>
            <button
              type="button"
              onClick={handleLock}
              className="p-2 text-paper/65 hover:text-paper rounded-xl hover:bg-paper/10 transition-colors"
              title="Lock console"
              aria-label="Lock console"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl w-full mx-auto px-4 sm:px-6 py-7 space-y-6 flex-1">
        {banner && (
          <div
            className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-l-4 text-xs font-medium ${
              banner.type === "success"
                ? "bg-pine/10 border-pine text-pine"
                : "bg-brick/10 border-brick text-brick"
            }`}
          >
            <div className="flex items-center gap-2">
              {banner.type === "success" ? (
                <CheckCircle2 size={15} />
              ) : (
                <CircleAlert size={15} />
              )}
              <span>{banner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setBanner(null)}
              className="p-1 opacity-60 hover:opacity-100"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* KPI Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
            <div className="text-xs font-medium text-ink/55">Societies</div>
            <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
              {societies.length}
            </div>
          </div>
          <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
            <div className="text-xs font-medium text-pine">Active Members</div>
            <div className="text-2xl font-bold text-pine mt-1 tabular-nums">
              {totalMembers}
            </div>
          </div>
          <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
            <div className="text-xs font-medium text-ink/55">
              Committee Admins
            </div>
            <div className="text-2xl font-bold text-ink mt-1 tabular-nums">
              {totalAdmins}
            </div>
          </div>
          <div className="rounded-2xl p-4 bg-paper border border-ink/8 shadow-soft">
            <div className="text-xs font-medium text-marigold">
              Open Tickets
            </div>
            <div className="text-2xl font-bold text-marigold mt-1 tabular-nums">
              {totalOpenIncidents}
            </div>
          </div>
        </div>

        {/* Societies List */}
        {isLoading && societies.length === 0 ? (
          <div className="space-y-4 animate-pulse">
            <div className="h-36 rounded-2xl bg-ink/6" />
            <div className="h-36 rounded-2xl bg-ink/6" />
          </div>
        ) : societies.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink/15 p-12 text-center space-y-3 bg-paper">
            <Building2 size={36} className="text-ink/25 mx-auto" />
            <h2 className="text-base font-bold text-ink">No societies yet</h2>
            <p className="text-xs text-ink/60 max-w-sm mx-auto leading-relaxed">
              Create your first RWA society here with pre-configured categories,
              teams, SLA rules, and your Chief Admin&apos;s onboarding link.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2.5 bg-pine text-on-pine text-xs font-semibold rounded-xl hover:bg-pine/90"
            >
              <Plus size={15} />
              <span>Create First Society</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {societies.map((soc) => (
              <section
                key={soc.id}
                className="rounded-2xl border border-ink/10 bg-paper p-5 sm:p-6 shadow-soft space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-lg font-bold text-ink tracking-tight">
                        {soc.name}
                      </h2>
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-ink/[0.05] text-ink/65">
                        {soc.defaultLanguage === "hi" ? "Hindi" : "English"}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-ink/55 tabular-nums">
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} />
                        {soc.stats.activeMembers} active members
                      </span>
                      <span>·</span>
                      <span>{soc.stats.spacesCount} flats/blocks</span>
                      <span>·</span>
                      <span>{soc.stats.teamsCount} teams</span>
                      <span>·</span>
                      <span>{soc.stats.categoriesCount} categories</span>
                      <span>·</span>
                      <span className="text-marigold font-medium">
                        {soc.stats.openIncidents} open tickets
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setInviteTarget(soc);
                      setAdminLang(soc.defaultLanguage);
                      setAdminAsChief(soc.admins.length === 0);
                    }}
                    className="px-3.5 py-2 rounded-xl bg-pine text-on-pine text-xs font-semibold hover:bg-pine/90 flex items-center gap-1.5 transition-all shrink-0"
                  >
                    <UserPlus size={14} />
                    <span>Invite Admin</span>
                  </button>
                </div>

                {/* Committee Admins List */}
                <div className="rounded-xl border border-ink/8 bg-ink/[0.015] divide-y divide-ink/8">
                  {soc.admins.length === 0 ? (
                    <div className="p-4 text-xs text-ink/55 flex items-center justify-between gap-2">
                      <span>
                        No committee admins assigned to this society yet.
                      </span>
                    </div>
                  ) : (
                    soc.admins.map((adm, idx) => (
                      <div
                        key={adm.rosterEntryId ?? adm.residentId ?? idx}
                        className="p-3.5 sm:px-4 flex flex-wrap items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                          <span className="font-semibold text-ink">
                            {adm.displayName}
                          </span>
                          {adm.isChiefAdmin ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-marigold/15 text-marigold">
                              <Crown size={11} />
                              <span>Chief Admin</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink/8 text-ink/70">
                              <Shield size={11} />
                              <span>Co-Admin</span>
                            </span>
                          )}
                          {adm.status === "claimed" ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-pine/10 text-pine">
                              Active
                            </span>
                          ) : adm.status === "pending" ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-marigold/10 text-marigold">
                              Pending invite
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-ink/8 text-ink/50">
                              Revoked
                            </span>
                          )}
                          {adm.phone && (
                            <span className="text-ink/50 tabular-nums">
                              {adm.phone}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {!adm.isChiefAdmin &&
                            adm.status === "claimed" &&
                            adm.residentId && (
                              <button
                                type="button"
                                disabled={busyEntryId === adm.residentId}
                                onClick={() => handleMakeChief(soc, adm)}
                                className="px-2.5 py-1.5 rounded-lg border border-ink/12 bg-paper hover:bg-ink/[0.04] text-[11px] font-medium text-ink/75 transition-colors disabled:opacity-50"
                              >
                                Make Chief
                              </button>
                            )}

                          {adm.rosterEntryId && (
                            <button
                              type="button"
                              disabled={busyEntryId === adm.rosterEntryId}
                              onClick={() =>
                                handleReissueAdminLink(soc.name, adm)
                              }
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-marigold/12 hover:bg-marigold/20 text-marigold font-semibold text-[11px] transition-colors disabled:opacity-50"
                            >
                              {busyEntryId === adm.rosterEntryId ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Link2 size={12} />
                              )}
                              <span>
                                {adm.status === "pending"
                                  ? "New Invite Link"
                                  : "Recovery Link"}
                              </span>
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            ))}
          </div>
        )}
      </main>

      {/* Create Society Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-paper border border-ink/12 rounded-2xl p-6 max-w-lg w-full shadow-elevated space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-ink/8 pb-3.5">
                <h2 className="text-base font-bold text-ink">
                  Create New Society (Zero SQL)
                </h2>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="p-1.5 text-ink/50 hover:text-ink rounded-lg hover:bg-ink/5"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <form
                onSubmit={handleCreateSociety}
                className="space-y-4 text-xs"
              >
                <div className="space-y-1.5">
                  <label className="font-semibold text-ink/75 block">
                    Society / RWA Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Gulmohar Greens RWA"
                    value={socName}
                    onChange={(e) => setSocName(e.target.value)}
                    className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold focus:ring-2 focus:ring-marigold/15"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Default Language
                    </label>
                    <select
                      value={socLang}
                      onChange={(e) =>
                        setSocLang(e.target.value as "en" | "hi")
                      }
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिन्दी (Hindi)</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Starter Towers / Areas
                    </label>
                    <input
                      type="text"
                      placeholder="Tower A, Tower B, Clubhouse"
                      value={socSpacesText}
                      onChange={(e) => setSocSpacesText(e.target.value)}
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                    />
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-pine/8 border border-pine/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={seedStarter}
                    onChange={(e) => setSeedStarter(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-ink/80 leading-relaxed">
                    <strong className="text-ink block">
                      Seed standard Indian RWA Categories, Teams & SLAs
                    </strong>
                    Auto-creates Electrical, Plumbing, Lift, Housekeeping &
                    Security teams + SLA policies (editable later in /teams).
                  </span>
                </label>

                <div className="pt-2 border-t border-ink/8 space-y-3">
                  <div className="font-semibold text-ink text-xs flex items-center gap-1.5">
                    <Crown size={13} className="text-marigold" />
                    <span>First Chief Admin</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="font-semibold text-ink/75 block">
                        Full Name *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Secretary Sharma"
                        value={chiefName}
                        onChange={(e) => setChiefName(e.target.value)}
                        className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="font-semibold text-ink/75 block">
                        Phone (optional)
                      </label>
                      <input
                        type="tel"
                        placeholder="e.g. 9876543210"
                        value={chiefPhone}
                        onChange={(e) => setChiefPhone(e.target.value)}
                        className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2 flex gap-2.5">
                  <button
                    type="submit"
                    disabled={
                      isCreatingSociety || !socName.trim() || !chiefName.trim()
                    }
                    className="flex-1 py-3 bg-pine text-on-pine text-sm font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
                  >
                    {isCreatingSociety ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Provisioning…</span>
                      </>
                    ) : (
                      <span>Create Society & Chief Link</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-3 text-sm font-medium text-ink/60 hover:text-ink rounded-xl hover:bg-ink/5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Invite Co-Admin Modal */}
      <AnimatePresence>
        {inviteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setInviteTarget(null)}
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
                  Invite Admin to {inviteTarget.name}
                </h2>
                <button
                  type="button"
                  onClick={() => setInviteTarget(null)}
                  className="p-1.5 text-ink/50 hover:text-ink rounded-lg hover:bg-ink/5"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <form onSubmit={handleInviteAdmin} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="font-semibold text-ink/75 block">
                    Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Treasurer Verma"
                    value={adminName}
                    onChange={(e) => setAdminName(e.target.value)}
                    className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Phone (optional)
                    </label>
                    <input
                      type="tel"
                      placeholder="9876543210"
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="font-semibold text-ink/75 block">
                      Language
                    </label>
                    <select
                      value={adminLang}
                      onChange={(e) =>
                        setAdminLang(e.target.value as "en" | "hi")
                      }
                      className="w-full p-2.5 text-sm border border-ink/15 rounded-xl bg-paper text-ink focus:outline-none focus:border-marigold"
                    >
                      <option value="en">English</option>
                      <option value="hi">हिन्दी</option>
                    </select>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-marigold/10 border border-marigold/25 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adminAsChief}
                    onChange={(e) => setAdminAsChief(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span className="text-ink/80 leading-relaxed">
                    <strong className="text-ink block">
                      Make Chief Admin upon join
                    </strong>
                    Cannot be removed by co-admins. Replaces any previous Chief
                    Admin once claimed.
                  </span>
                </label>

                <div className="pt-2 flex gap-2.5">
                  <button
                    type="submit"
                    disabled={isInvitingAdmin || !adminName.trim()}
                    className="flex-1 py-3 bg-pine text-on-pine text-sm font-semibold rounded-xl hover:bg-pine/90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isInvitingAdmin ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        <span>Generating…</span>
                      </>
                    ) : (
                      <span>Generate Admin Link</span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => setInviteTarget(null)}
                    className="px-4 py-3 text-sm font-medium text-ink/60 hover:text-ink rounded-xl hover:bg-ink/5"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Generated Link / WhatsApp Modal */}
      <AnimatePresence>
        {linkModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-ink/45 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setLinkModal(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-paper border border-ink/12 rounded-2xl p-6 max-w-md w-full shadow-elevated space-y-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-pine text-xs font-semibold">
                    <CheckCircle2 size={15} />
                    <span>{linkModal.title}</span>
                  </div>
                  <p className="text-xs text-ink/65 leading-relaxed">
                    {linkModal.subtitle}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setLinkModal(null)}
                  className="p-1 text-ink/45 hover:text-ink"
                  aria-label="Close"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="p-3 rounded-xl bg-ink/[0.04] border border-ink/10 font-mono text-xs break-all text-ink select-all">
                {linkModal.claimUrl}
              </div>

              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(linkModal.claimUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 3000);
                  }}
                  className="flex-1 py-2.5 px-3 bg-marigold text-on-marigold font-semibold text-xs rounded-xl hover:bg-marigold/90 flex items-center justify-center gap-1.5 transition-all"
                >
                  {copiedLink ? <Check size={14} /> : <Copy size={14} />}
                  <span>{copiedLink ? "Copied!" : "Copy Link"}</span>
                </button>

                <a
                  href={`https://api.whatsapp.com/send?text=${encodeURIComponent(
                    `Hello ${linkModal.displayName}! Here is your private ${
                      linkModal.isChiefAdmin ? "Chief Admin" : "Committee Admin"
                    } access link for ${
                      linkModal.societyName
                    } on Nivas:\n\n${linkModal.claimUrl}\n\nTap the link to open your Admin Console (valid 30 days).`,
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2.5 px-3 bg-pine text-on-pine font-semibold text-xs rounded-xl hover:bg-pine/90 flex items-center justify-center gap-1.5 transition-all"
                >
                  <MessageSquare size={14} />
                  <span>WhatsApp</span>
                </a>
              </div>

              <div className="pt-2 border-t border-ink/8 flex justify-end">
                <button
                  type="button"
                  onClick={() => setLinkModal(null)}
                  className="px-4 py-2 text-xs font-semibold text-ink/65 hover:text-ink rounded-xl hover:bg-ink/5"
                >
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
