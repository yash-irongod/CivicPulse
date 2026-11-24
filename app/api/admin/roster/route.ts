// GET & POST /api/admin/roster — Committee Admin Resident Roster & Invite Management.
// Lets committee admins view all invited/claimed residents, issue new invites with one-time
// claim tokens, and manage flats/spaces.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const addResidentSchema = z.object({
  displayName: z.string().trim().min(1, "Name is required").max(100),
  phone: z.string().trim().max(20).optional(),
  spaceName: z.string().trim().max(100).optional(),
  preferredLanguage: z.enum(["en", "hi"]).default("en"),
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
    // 1. Fetch community details
    const { data: community } = await admin
      .from("communities")
      .select("id, name, default_language")
      .eq("id", communityId)
      .maybeSingle();

    // 2. Fetch all roster entries with space info
    const { data: entries, error: entriesErr } = await admin
      .from("roster_entries")
      .select(
        `
        id,
        display_name,
        phone,
        preferred_language,
        status,
        claim_token_expires_at,
        claimed_at,
        created_at,
        space:spaces(id, name)
      `,
      )
      .eq("community_id", communityId)
      .order("created_at", { ascending: false });

    if (entriesErr) throw entriesErr;

    // 3. Fetch all spaces (flats/units) in community
    const { data: spaces, error: spacesErr } = await admin
      .from("spaces")
      .select("id, name, created_at")
      .eq("community_id", communityId)
      .order("name", { ascending: true });

    if (spacesErr) throw spacesErr;

    const formattedEntries = (entries || []).map((e) => {
      const spaceData = e.space as unknown;
      const sp = Array.isArray(spaceData)
        ? (spaceData[0] as { id: string; name: string } | undefined)
        : (spaceData as { id: string; name: string } | null);
      return {
        id: e.id,
        displayName: e.display_name,
        phone: e.phone,
        preferredLanguage: e.preferred_language,
        status: e.status,
        expiresAt: e.claim_token_expires_at,
        claimedAt: e.claimed_at,
        createdAt: e.created_at,
        spaceId: sp?.id ?? null,
        spaceName: sp?.name ?? null,
      };
    });

    return json(
      {
        communityName: community?.name ?? "Society",
        entries: formattedEntries,
        spaces: (spaces || []).map((s) => ({ id: s.id, name: s.name })),
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
    body = addResidentSchema.parse(raw);
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
        // Auto-create flat/space
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

    // Provision via the stored procedure
    const entryPayload = [
      {
        display_name: body.displayName,
        phone: body.phone || null,
        preferred_language: body.preferredLanguage,
        space_name: resolvedSpaceName,
      },
    ];

    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "provision_roster_entries",
      {
        p_community_id: communityId,
        p_entries: entryPayload,
        p_valid_days: 30, // 30-day validity for convenience
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
