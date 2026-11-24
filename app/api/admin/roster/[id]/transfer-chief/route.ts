// POST /api/admin/roster/[id]/transfer-chief — Transfer Chief Admin privileges.
// Restricted strictly to the society's active Chief Admin.

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
  const communityId = session.activeCommunityId;

  try {
    // Verify caller holds active is_chief_admin in this society
    const { data: callerChief, error: chiefErr } = await admin
      .from("memberships")
      .select("id")
      .eq("community_id", communityId)
      .eq("resident_id", session.resident.id)
      .eq("role", "committee_admin")
      .eq("status", "active")
      .eq("is_chief_admin", true)
      .maybeSingle();

    if (chiefErr) throw chiefErr;
    if (!callerChief) {
      return json({ error: "chief_admin_required" }, 403);
    }

    const { data: targetEntry, error: targetErr } = await admin
      .from("roster_entries")
      .select("id, community_id, resident_id, status")
      .eq("id", rosterEntryId)
      .maybeSingle();

    if (targetErr) throw targetErr;
    if (!targetEntry || targetEntry.community_id !== communityId) {
      return json({ error: "not_found" }, 404);
    }

    if (!targetEntry.resident_id || targetEntry.status !== "claimed") {
      return json({ error: "member_must_be_active" }, 400);
    }

    const { error: rpcErr } = await admin.rpc("transfer_chief_admin", {
      p_community_id: communityId,
      p_to_resident_id: targetEntry.resident_id,
      p_actor_resident_id: session.resident.id,
    });

    if (rpcErr) {
      logEvent("error", "transfer_chief.rpc_failed", describeError(rpcErr));
      return json({ error: "transfer_failed" }, 400);
    }

    logEvent("info", "transfer_chief.success", {
      communityId,
      toResidentId: targetEntry.resident_id,
    });
    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "transfer_chief.failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
