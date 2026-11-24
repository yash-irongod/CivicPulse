// POST /api/admin/roster/[id]/revoke — Revoke a resident invite.

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
  _request: NextRequest,
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
    const { error: updateErr } = await admin
      .from("roster_entries")
      .update({
        status: "revoked",
        claim_token_hash: null,
        claim_token_expires_at: null,
      })
      .eq("id", rosterEntryId)
      .eq("community_id", session.activeCommunityId);

    if (updateErr) throw updateErr;

    logEvent("info", "roster_revoke.success", { rosterEntryId });
    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "roster_revoke.failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
