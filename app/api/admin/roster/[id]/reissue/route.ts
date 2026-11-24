// POST /api/admin/roster/[id]/reissue — Reissue claim token for resident.
// Reopens a pending/claimed/revoked roster entry with a fresh 30-day claim token.

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

type RouteContext = { params: Promise<{ id: string }> };

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: rosterEntryId } = await params;

  if (!z.guid().safeParse(rosterEntryId).success) {
    return json({ error: "not_found" }, 404);
  }

  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    // Verify entry belongs to caller's community
    const { data: entry } = await admin
      .from("roster_entries")
      .select("id, community_id, display_name")
      .eq("id", rosterEntryId)
      .maybeSingle();

    if (!entry || entry.community_id !== session.activeCommunityId) {
      return json({ error: "not_found" }, 404);
    }

    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "reissue_roster_claim",
      {
        p_roster_entry_id: rosterEntryId,
        p_valid_days: 30,
        p_allow_device_transfer: true,
      },
    );

    if (rpcErr || !rpcResult || rpcResult.length === 0) {
      logEvent("error", "roster_reissue.rpc_failed", describeError(rpcErr));
      return json({ error: "reissue_failed" }, 500);
    }

    const row = rpcResult[0];
    const origin = request.nextUrl.origin;
    const fullClaimUrl = `${origin}${row.claim_path}`;

    return json(
      {
        success: true,
        claimToken: row.claim_token,
        claimPath: row.claim_path,
        claimUrl: fullClaimUrl,
        expiresAt: row.valid_until,
      },
      200,
    );
  } catch (err) {
    logEvent("error", "roster_reissue.exception", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
