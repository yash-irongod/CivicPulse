// POST /api/incidents/[id]/feedback — Resident Star Rating Feedback.
// Lets the resident rate the resolution (1–5 stars) with an optional comment.
// Rating ≥ 4 → closed (happy). Rating ≤ 3 → escalated to admin for review.
// Residents do NOT have direct reopen power — only admin decides after escalation.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { notifyAdmins, notifyReporters } from "@/lib/notify/incident-notify";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const feedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
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
      p_note: "Awaiting resident feedback.",
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

  // 2. Save feedback rating and comment on the incident
  const { error: feedbackUpdateErr } = await admin
    .from("incidents")
    .update({
      feedback_rating: body.rating,
      feedback_comment: body.comment?.trim() || null,
      feedback_at: new Date().toISOString(),
      feedback_resident_id: session.resident.id,
    })
    .eq("id", incidentId);

  if (feedbackUpdateErr) {
    logEvent(
      "error",
      "feedback.update_failed",
      describeError(feedbackUpdateErr),
    );
    return json({ error: "server_error" }, 500);
  }

  // 3. Determine target status based on rating
  // ≥ 4 stars: resident is satisfied → close the ticket
  // ≤ 3 stars: resident is not satisfied → escalate to admin
  const isHappy = body.rating >= 4;
  const targetStatus = isHappy ? "closed" : "escalated";
  const ratingStars = "★".repeat(body.rating) + "☆".repeat(5 - body.rating);

  const note = isHappy
    ? `Resident rated ${ratingStars} (${body.rating}/5): ${body.comment || "Satisfied with the work."}`
    : `Resident rated ${ratingStars} (${body.rating}/5): ${body.comment || "Not satisfied."} — Escalated to admin for review.`;

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

  // 4. Dispatch notifications (fire-and-forget)
  (async () => {
    if (!isHappy) {
      await notifyAdmins(admin, incident.community_id, "escalated", {
        incidentId,
        rating: body.rating,
        comment: body.comment,
      });
    } else {
      await notifyAdmins(admin, incident.community_id, "feedback_received", {
        incidentId,
        rating: body.rating,
        comment: body.comment,
      });
    }

    await notifyReporters(admin, incidentId, "status_changed", {
      incidentId,
      fromStatus: "resident_feedback",
      toStatus: targetStatus,
    });
  })().catch((err) => {
    logEvent("warn", "feedback.notify_failed", describeError(err));
  });

  // 5. Log escalation if applicable
  if (!isHappy) {
    logEvent("info", "incident.escalated_by_feedback", {
      incidentId,
      rating: body.rating,
      residentId: session.resident.id,
    });
  }

  return json(
    {
      success: true,
      incidentId,
      status: targetStatus,
      rating: body.rating,
      escalated: !isHappy,
    },
    200,
  );
}
