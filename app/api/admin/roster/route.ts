// GET & POST /api/admin/roster — Committee Admin Roster, Roles, Staff Teams & Invites.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  buildRosterDirectory,
  type LiveMembershipRow,
  type LiveTeamMemberRow,
  type RawRosterEntry,
} from "@/lib/admin/roster-service";
import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { roleSchema } from "@/lib/auth/roles";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const addMemberSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().max(20).optional(),
  spaceName: z.string().trim().max(100).optional(),
  preferredLanguage: z.enum(["en", "hi"]).default("en"),
  role: roleSchema.default("resident"),
  teamId: z.guid().nullable().optional(),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "admin_roster.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const [
      { data: community },
      { data: entries, error: entriesErr },
      { data: spaces, error: spacesErr },
      { data: teams, error: teamsErr },
      { data: activeMemberships, error: memErr },
    ] = await Promise.all([
      admin
        .from("communities")
        .select("id, name, default_language")
        .eq("id", communityId)
        .maybeSingle(),
      admin
        .from("roster_entries")
        .select(
          `
          id,
          community_id,
          resident_id,
          display_name,
          phone,
          preferred_language,
          status,
          intended_role,
          intended_team_id,
          is_chief_admin,
          claim_token_expires_at,
          claimed_at,
          created_at,
          space:spaces(id, name),
          team:teams(id, name)
        `,
        )
        .eq("community_id", communityId)
        .order("created_at", { ascending: false }),
      admin
        .from("spaces")
        .select("id, name, created_at")
        .eq("community_id", communityId)
        .order("name", { ascending: true }),
      admin
        .from("teams")
        .select("id, name")
        .eq("community_id", communityId)
        .order("name", { ascending: true }),
      admin
        .from("memberships")
        .select("resident_id, role, status, is_chief_admin")
        .eq("community_id", communityId)
        .eq("status", "active"),
    ]);

    if (entriesErr) throw entriesErr;
    if (spacesErr) throw spacesErr;
    if (teamsErr) throw teamsErr;
    if (memErr) throw memErr;

    const teamList = (teams || []) as Array<{ id: string; name: string }>;
    const teamIds = teamList.map((t) => t.id);
    const teamNameMap = new Map(teamList.map((t) => [t.id, t.name]));

    let liveTeamRows: LiveTeamMemberRow[] = [];
    if (teamIds.length > 0) {
      const { data: tmData, error: tmErr } = await admin
        .from("team_members")
        .select("resident_id, team_id")
        .in("team_id", teamIds);

      if (tmErr) throw tmErr;
      liveTeamRows = (tmData || []).map((tm) => ({
        resident_id: tm.resident_id as string,
        team_id: tm.team_id as string,
        teamName: teamNameMap.get(tm.team_id as string),
      }));
    }

    const activeList = (activeMemberships || []) as LiveMembershipRow[];
    const callerIsChiefAdmin = activeList.some(
      (m) =>
        m.resident_id === session.resident.id &&
        m.role === "committee_admin" &&
        Boolean(m.is_chief_admin),
    );

    const formattedEntries = buildRosterDirectory(
      (entries || []) as unknown as RawRosterEntry[],
      activeList,
      liveTeamRows,
    );

    return json(
      {
        communityName: community?.name ?? "Society",
        callerResidentId: session.resident.id,
        callerIsChiefAdmin,
        entries: formattedEntries,
        spaces: (spaces || []).map((s) => ({ id: s.id, name: s.name })),
        teams: teamList,
      },
      200,
    );
  } catch (err) {
    logEvent("error", "admin_roster.fetch_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "admin_roster.add_auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    const raw = await request.json();
    body = addMemberSchema.parse(raw);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return json(
        { error: "invalid_input", details: e.flatten().fieldErrors },
        400,
      );
    }
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    let resolvedTeamId: string | null = null;
    if (body.role === "maintenance_staff" && body.teamId) {
      const { data: teamRow, error: teamErr } = await admin
        .from("teams")
        .select("id")
        .eq("id", body.teamId)
        .eq("community_id", communityId)
        .maybeSingle();

      if (teamErr) throw teamErr;
      if (!teamRow) {
        return json({ error: "invalid_team" }, 400);
      }
      resolvedTeamId = teamRow.id;
    }

    let resolvedSpaceName = body.spaceName?.trim() || null;

    // If spaceName provided, check if space exists or create it
    if (resolvedSpaceName) {
      const { data: existingSpace } = await admin
        .from("spaces")
        .select("id, name")
        .eq("community_id", communityId)
        .ilike("name", resolvedSpaceName)
        .maybeSingle();

      if (!existingSpace) {
        const { error: createSpaceErr } = await admin.from("spaces").insert({
          community_id: communityId,
          name: resolvedSpaceName,
        });

        if (createSpaceErr) {
          logEvent(
            "warn",
            "admin_roster.space_create_failed",
            describeError(createSpaceErr),
          );
        }
      } else {
        resolvedSpaceName = existingSpace.name;
      }
    }

    const entryPayload = [
      {
        display_name: body.displayName,
        phone: body.phone || null,
        preferred_language: body.preferredLanguage,
        space_name: resolvedSpaceName,
        role: body.role,
        team_id: resolvedTeamId,
        is_chief_admin: false,
      },
    ];

    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "provision_roster_entries",
      {
        p_community_id: communityId,
        p_entries: entryPayload,
        p_valid_days: 30,
      },
    );

    if (rpcErr || !rpcResult || rpcResult.length === 0) {
      logEvent("error", "admin_roster.rpc_failed", describeError(rpcErr));
      return json({ error: rpcErr?.message || "provision_failed" }, 500);
    }

    const row = rpcResult[0];
    const origin = request.nextUrl.origin;
    const fullClaimUrl = `${origin}${row.claim_path}`;

    return json(
      {
        success: true,
        entry: {
          id: row.roster_entry_id,
          displayName: row.entry_display_name,
          role: body.role,
          teamId: resolvedTeamId,
          claimToken: row.claim_token,
          claimPath: row.claim_path,
          claimUrl: fullClaimUrl,
          expiresAt: row.valid_until,
        },
      },
      201,
    );
  } catch (err) {
    logEvent("error", "admin_roster.add_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
