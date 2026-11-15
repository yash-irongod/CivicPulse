// POST /api/admin/incidents/[id]/duplicate-action — Confirm or dismiss duplicate flag (Task 9.2, §6.6).
// Confirm: merges linked issues into the target incident.
// Dismiss: clears the possible_duplicate_of pointer.

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

const actionSchema = z.object({
  action: z.enum(["confirm", "dismiss"]),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: incidentId } = await params;

  if (!z.guid().safeParse(incidentId).success) {
    return json({ error: "not_found" }, 404);
  }

  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "duplicate_action.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    const raw = await request.json();
    body = actionSchema.parse(raw);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  // 1. Fetch incident
  const { data: incident, error: incErr } = await db
    .from("incidents")
    .select("id, community_id, possible_duplicate_of")
    .eq("id", incidentId)
    .maybeSingle();

  if (incErr || !incident) {
    return json({ error: "incident_not_found" }, 404);
  }

  if (incident.community_id !== session.activeCommunityId) {
    return json({ error: "forbidden" }, 403);
  }

  if (body.action === "dismiss") {
    // Clear possible_duplicate_of pointer
    const { error: updateErr } = await admin
      .from("incidents")
      .update({ possible_duplicate_of: null })
      .eq("id", incidentId);

    if (updateErr) {
      logEvent(
        "error",
        "duplicate_action.dismiss_failed",
        describeError(updateErr),
      );
      return json({ error: "server_error" }, 500);
    }

    return json({ success: true, action: "dismissed" }, 200);
  }

  if (body.action === "confirm") {
    const targetIncidentId = incident.possible_duplicate_of;
    if (!targetIncidentId) {
      return json({ error: "no_duplicate_target" }, 400);
    }

    // Find all issues linked to this incident
    const { data: issueLinks, error: linkErr } = await admin
      .from("incident_issues")
      .select("issue_id")
      .eq("incident_id", incidentId);

    if (linkErr) {
      logEvent(
        "error",
        "duplicate_action.find_links_failed",
        describeError(linkErr),
      );
      return json({ error: "server_error" }, 500);
    }

    // Merge each issue into the target incident
    for (const link of issueLinks || []) {
      const { error: mergeErr } = await admin.rpc("merge_issue_into_incident", {
        p_issue_id: link.issue_id,
        p_target_incident_id: targetIncidentId,
        p_actor_resident_id: session.resident.id,
      });

      if (mergeErr) {
        logEvent(
          "error",
          "duplicate_action.merge_failed",
          describeError(mergeErr),
        );
        return json({ error: "merge_failed" }, 500);
      }
    }

    // Delete redundant incident shell
    await admin.from("incidents").delete().eq("id", incidentId);

    return json(
      {
        success: true,
        action: "confirmed",
        mergedIntoIncidentId: targetIncidentId,
      },
      200,
    );
  }

  return json({ error: "invalid_action" }, 400);
}
