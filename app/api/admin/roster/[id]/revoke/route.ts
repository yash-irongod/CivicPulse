// POST /api/admin/roster/[id]/revoke — Revoke invite AND deactivate live society access.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { revokeRosterMember } from "@/lib/admin/roster-service";
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
    const result = await revokeRosterMember(admin, {
      rosterEntryId,
      communityId: session.activeCommunityId,
      actorResidentId: session.resident.id,
    });

    if (result.kind === "not_found") {
      return json({ error: "not_found" }, 404);
    }
    if (result.kind === "forbidden") {
      return json({ error: result.code }, 403);
    }

    logEvent("info", "roster_revoke.success", { rosterEntryId });
    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "roster_revoke.failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
