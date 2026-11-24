// Shared server-side Roster & Membership operations (Phase 9).
// Keeps complex cross-table mutations (role/team updates, true member revocation,
// and chief-admin protections) clean and unit-testable with fake Supabase clients.

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role } from "../auth/roles";

export interface RawRosterEntry {
  id: string;
  community_id: string;
  resident_id: string | null;
  display_name: string;
  phone: string | null;
  preferred_language: string;
  status: "pending" | "claimed" | "revoked";
  intended_role?: Role;
  intended_team_id?: string | null;
  is_chief_admin?: boolean;
  claim_token_expires_at: string | null;
  claimed_at: string | null;
  created_at: string;
  space?: unknown;
  team?: unknown;
}

export interface LiveMembershipRow {
  resident_id: string;
  role: Role;
  status: "active" | "inactive";
  is_chief_admin?: boolean;
}

export interface LiveTeamMemberRow {
  resident_id: string;
  team_id: string;
  teamName?: string;
}

export interface FormattedRosterEntry {
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

const ROLE_PRIORITY: Readonly<Record<Role, number>> = {
  committee_admin: 0,
  maintenance_staff: 1,
  resident: 2,
};

function unwrapRelation<T extends { id: string; name: string }>(
  rel: unknown,
): T | null {
  if (!rel) return null;
  if (Array.isArray(rel)) return (rel[0] as T | undefined) ?? null;
  return rel as T;
}

/**
 * Merges roster_entries with live active memberships and community-scoped
 * team_members so UI always displays up-to-date roles, teams, and Chief Admin flags.
 */
export function buildRosterDirectory(
  entries: RawRosterEntry[],
  activeMemberships: LiveMembershipRow[],
  teamMemberships: LiveTeamMemberRow[],
): FormattedRosterEntry[] {
  // Choose primary active role per resident_id (chief > committee_admin > maintenance_staff > resident)
  const membershipByResident = new Map<string, LiveMembershipRow>();
  for (const m of activeMemberships) {
    if (m.status !== "active") continue;
    const prev = membershipByResident.get(m.resident_id);
    if (!prev) {
      membershipByResident.set(m.resident_id, m);
      continue;
    }
    if (m.is_chief_admin && !prev.is_chief_admin) {
      membershipByResident.set(m.resident_id, m);
      continue;
    }
    if (
      !prev.is_chief_admin &&
      ROLE_PRIORITY[m.role] < ROLE_PRIORITY[prev.role]
    ) {
      membershipByResident.set(m.resident_id, m);
    }
  }

  const teamByResident = new Map<string, LiveTeamMemberRow>();
  for (const tm of teamMemberships) {
    if (!teamByResident.has(tm.resident_id)) {
      teamByResident.set(tm.resident_id, tm);
    }
  }

  return entries.map((e) => {
    const sp = unwrapRelation<{ id: string; name: string }>(e.space);
    const intendedTeam = unwrapRelation<{ id: string; name: string }>(e.team);
    const liveMem = e.resident_id
      ? membershipByResident.get(e.resident_id)
      : undefined;
    const liveTeam = e.resident_id
      ? teamByResident.get(e.resident_id)
      : undefined;

    const effectiveRole: Role =
      e.status === "claimed" && liveMem
        ? liveMem.role
        : (e.intended_role ?? "resident");

    const effectiveChief =
      e.status === "claimed" && liveMem
        ? Boolean(liveMem.is_chief_admin)
        : Boolean(e.is_chief_admin);

    const effectiveTeamId =
      effectiveRole === "maintenance_staff"
        ? (liveTeam?.team_id ?? intendedTeam?.id ?? e.intended_team_id ?? null)
        : null;

    const effectiveTeamName =
      effectiveRole === "maintenance_staff"
        ? (liveTeam?.teamName ?? intendedTeam?.name ?? null)
        : null;

    return {
      id: e.id,
      residentId: e.resident_id,
      displayName: e.display_name,
      phone: e.phone,
      preferredLanguage: e.preferred_language,
      status: e.status,
      role: effectiveRole,
      isChiefAdmin: effectiveChief,
      teamId: effectiveTeamId,
      teamName: effectiveTeamName,
      expiresAt: e.claim_token_expires_at,
      claimedAt: e.claimed_at,
      createdAt: e.created_at,
      spaceId: sp?.id ?? null,
      spaceName: sp?.name ?? null,
    };
  });
}

export type RosterMutationResult =
  | { kind: "ok" }
  | { kind: "not_found" }
  | {
      kind: "forbidden";
      code:
        | "cannot_revoke_chief_admin"
        | "cannot_revoke_self"
        | "cannot_modify_chief_admin"
        | "cannot_modify_self"
        | "invalid_team";
    };

async function clearCommunityTeamMemberships(
  admin: SupabaseClient,
  communityId: string,
  residentId: string,
): Promise<void> {
  const { data: communityTeams, error: teamsErr } = await admin
    .from("teams")
    .select("id")
    .eq("community_id", communityId);

  if (teamsErr) throw teamsErr;
  const communityTeamIds = (communityTeams ?? []).map((t) => t.id as string);
  if (communityTeamIds.length === 0) return;

  const { error: delErr } = await admin
    .from("team_members")
    .delete()
    .eq("resident_id", residentId)
    .in("team_id", communityTeamIds);

  if (delErr) throw delErr;
}

async function isTargetChiefAdmin(
  admin: SupabaseClient,
  communityId: string,
  entry: { resident_id: string | null; is_chief_admin?: boolean | null },
): Promise<boolean> {
  if (entry.is_chief_admin) return true;
  if (!entry.resident_id) return false;

  const { data, error } = await admin
    .from("memberships")
    .select("id")
    .eq("community_id", communityId)
    .eq("resident_id", entry.resident_id)
    .eq("status", "active")
    .eq("is_chief_admin", true)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

/**
 * Revokes a roster invite AND immediately revokes live community access
 * (deactivates memberships + strips community team assignments). Blocks revoking Chief Admin or self.
 */
export async function revokeRosterMember(
  admin: SupabaseClient,
  params: {
    rosterEntryId: string;
    communityId: string;
    actorResidentId: string;
  },
): Promise<RosterMutationResult> {
  const { rosterEntryId, communityId, actorResidentId } = params;

  const { data: entry, error: lookupErr } = await admin
    .from("roster_entries")
    .select("id, community_id, resident_id, is_chief_admin")
    .eq("id", rosterEntryId)
    .maybeSingle();

  if (lookupErr) throw lookupErr;
  if (!entry || entry.community_id !== communityId) {
    return { kind: "not_found" };
  }

  if (entry.resident_id && entry.resident_id === actorResidentId) {
    return { kind: "forbidden", code: "cannot_revoke_self" };
  }

  if (await isTargetChiefAdmin(admin, communityId, entry)) {
    return { kind: "forbidden", code: "cannot_revoke_chief_admin" };
  }

  const { error: revokeErr } = await admin
    .from("roster_entries")
    .update({
      status: "revoked",
      claim_token_hash: null,
      claim_token_expires_at: null,
      allow_device_transfer: false,
    })
    .eq("id", rosterEntryId)
    .eq("community_id", communityId);

  if (revokeErr) throw revokeErr;

  if (entry.resident_id) {
    const { error: memErr } = await admin
      .from("memberships")
      .update({
        status: "inactive",
        is_chief_admin: false,
      })
      .eq("resident_id", entry.resident_id)
      .eq("community_id", communityId);

    if (memErr) throw memErr;

    await clearCommunityTeamMemberships(admin, communityId, entry.resident_id);
  }

  return { kind: "ok" };
}

/**
 * Updates a roster entry's role & optional maintenance team in-place for both
 * pending invites and already-claimed active members. Blocks modifying self or Chief Admin.
 */
export async function updateRosterMemberRole(
  admin: SupabaseClient,
  params: {
    rosterEntryId: string;
    communityId: string;
    actorResidentId: string;
    role: Role;
    teamId: string | null;
  },
): Promise<RosterMutationResult> {
  const { rosterEntryId, communityId, actorResidentId, role, teamId } = params;
  const effectiveTeamId = role === "maintenance_staff" ? teamId : null;

  const { data: entry, error: lookupErr } = await admin
    .from("roster_entries")
    .select("id, community_id, resident_id, space_id, status, is_chief_admin")
    .eq("id", rosterEntryId)
    .maybeSingle();

  if (lookupErr) throw lookupErr;
  if (!entry || entry.community_id !== communityId) {
    return { kind: "not_found" };
  }

  if (entry.resident_id && entry.resident_id === actorResidentId) {
    return { kind: "forbidden", code: "cannot_modify_self" };
  }

  if (await isTargetChiefAdmin(admin, communityId, entry)) {
    return { kind: "forbidden", code: "cannot_modify_chief_admin" };
  }

  if (effectiveTeamId) {
    const { data: teamRow, error: teamErr } = await admin
      .from("teams")
      .select("id")
      .eq("id", effectiveTeamId)
      .eq("community_id", communityId)
      .maybeSingle();

    if (teamErr) throw teamErr;
    if (!teamRow) {
      return { kind: "forbidden", code: "invalid_team" };
    }
  }

  const { error: entryUpdateErr } = await admin
    .from("roster_entries")
    .update({
      intended_role: role,
      intended_team_id: effectiveTeamId,
    })
    .eq("id", rosterEntryId)
    .eq("community_id", communityId);

  if (entryUpdateErr) throw entryUpdateErr;

  if (entry.resident_id && entry.status === "claimed") {
    // Deactivate other role rows in this community so a demoted member never retains elevated routes
    const { error: deactivateErr } = await admin
      .from("memberships")
      .update({ status: "inactive", is_chief_admin: false })
      .eq("resident_id", entry.resident_id)
      .eq("community_id", communityId)
      .neq("role", role);

    if (deactivateErr) throw deactivateErr;

    const { error: upsertErr } = await admin.from("memberships").upsert(
      {
        resident_id: entry.resident_id,
        community_id: communityId,
        space_id: entry.space_id,
        role,
        status: "active",
        is_chief_admin: false,
      },
      { onConflict: "resident_id,community_id,role" },
    );

    if (upsertErr) throw upsertErr;

    await clearCommunityTeamMemberships(admin, communityId, entry.resident_id);

    if (role === "maintenance_staff" && effectiveTeamId) {
      const { error: tmErr } = await admin.from("team_members").upsert(
        {
          team_id: effectiveTeamId,
          resident_id: entry.resident_id,
        },
        { onConflict: "team_id,resident_id" },
      );
      if (tmErr) throw tmErr;
    }
  }

  return { kind: "ok" };
}
