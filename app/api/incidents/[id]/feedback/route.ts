// POST /api/incidents/[id]/feedback — Resident Confirmation / Dispute (Task 8.4, §6.5, §6.7).
// Lets the resident close the incident (confirmed: true -> closed)
// or dispute and reopen it (confirmed: false -> assigned).

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

const feedbackInputSchema = z.object({
  confirmed: z.boolean(),
  comment: z.string().optional(),
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
    session = await requireRole(
      ["resident", "committee_admin", "maintenance_staff"],
      db,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "feedback.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    const rawBody = await request.json();
    body = feedbackInputSchema.parse(rawBody);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  // 1. Fetch incident and verify caller's community
  const { data: incident, error: incidentErr } = await db
    .from("incidents")
    .select("id, community_id, status, assigned_team_id")
    .eq("id", incidentId)
    .maybeSingle();

  if (incidentErr || !incident) {
    return json({ error: "incident_not_found" }, 404);
  }

  if (incident.community_id !== session.activeCommunityId) {
    return json({ error: "forbidden" }, 403);
  }

  let currentStatus = incident.status;

  // If incident is still at 'resolved', advance to 'resident_feedback' first
  if (currentStatus === "resolved") {
    const { error: prepError } = await admin.rpc("transition_incident", {
      p_incident_id: incidentId,
      p_actor_resident_id: session.resident.id,
      p_to_status: "resident_feedback",
      p_category_id: null,
      p_assigned_team_id: null,
      p_severity: null,
      p_note: "Awaiting resident confirmation.",
    });

    if (prepError) {
      logEvent(
        "error",
        "feedback.prep_transition_failed",
        describeError(prepError),
      );
      return json({ error: "transition_failed" }, 500);
    }
    currentStatus = "resident_feedback";
  }

  if (currentStatus !== "resident_feedback") {
    return json(
      {
        error: "invalid_state",
        message: `Incident is at '${currentStatus}', not awaiting resident feedback.`,
      },
      400,
    );
  }

  // 2. Perform target transition:
  // confirmed = true -> closed
  // confirmed = false -> assigned (the documented reopen move per §6.5, §8.4)
  const targetStatus = body.confirmed ? "closed" : "assigned";
  const note = body.confirmed
    ? `Resident confirmed resolution: ${body.comment || "Confirmed fixed."}`
    : `Resident disputed resolution: ${body.comment || "Problem reported as still unresolved."}`;

  const { error: transitionErr } = await admin.rpc("transition_incident", {
    p_incident_id: incidentId,
    p_actor_resident_id: session.resident.id,
    p_to_status: targetStatus,
    p_category_id: null,
    p_assigned_team_id: null,
    p_severity: null,
    p_note: note,
  });

  if (transitionErr) {
    logEvent(
      "error",
      "feedback.transition_failed",
      describeError(transitionErr),
    );
    return json({ error: "transition_failed" }, 500);
  }

  // 3. Notify community / team if disputed
  if (!body.confirmed) {
    logEvent("info", "incident.disputed_and_reopened", {
      incidentId,
      residentId: session.resident.id,
    });
  }

  return json(
    {
      success: true,
      incidentId,
      status: targetStatus,
      reopened: !body.confirmed,
    },
    200,
  );
}
