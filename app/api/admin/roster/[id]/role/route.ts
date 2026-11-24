// PATCH /api/admin/roster/[id]/role — Update a member's role and/or maintenance team in-place.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { updateRosterMemberRole } from "@/lib/admin/roster-service";
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

type RouteContext = { params: Promise<{ id: string }> };

const updateRoleSchema = z.object({
  role: roleSchema,
  teamId: z.guid().nullable().optional(),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(
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

  let body;
  try {
    const raw = await request.json();
    body = updateRoleSchema.parse(raw);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    const result = await updateRosterMemberRole(admin, {
      rosterEntryId,
      communityId: session.activeCommunityId,
      actorResidentId: session.resident.id,
      role: body.role,
      teamId: body.teamId ?? null,
    });

    if (result.kind === "not_found") {
      return json({ error: "not_found" }, 404);
    }
    if (result.kind === "forbidden") {
      const status = result.code === "invalid_team" ? 400 : 403;
      return json({ error: result.code }, status);
    }

    logEvent("info", "roster_role.updated", {
      rosterEntryId,
      role: body.role,
    });
    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "roster_role.failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
