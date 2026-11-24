// POST /api/issues/[id]/confirm-category — Confirm or override an issue's category (Task 8.2).
// Updates category on issue and incident, assigns SLA, and advances incident from `reported` to `validated`.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { assignIncidentSla } from "@/lib/lifecycle/sla";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  categoryId: z.guid(),
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
  const { id: issueId } = await params;

  if (!z.guid().safeParse(issueId).success) {
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
    logEvent("error", "confirm_category.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    const rawBody = await request.json();
    body = bodySchema.parse(rawBody);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  // 1. Verify issue exists in user's community
  const { data: issue, error: issueErr } = await db
    .from("issues")
    .select("id, community_id, reporter_id")
    .eq("id", issueId)
    .maybeSingle();

  if (issueErr || !issue) {
    return json({ error: "issue_not_found" }, 404);
  }

  if (issue.community_id !== session.activeCommunityId) {
    return json({ error: "forbidden" }, 403);
  }

  // 2. Verify category belongs to community and is active
  const { data: category, error: catErr } = await db
    .from("categories")
    .select("id, name")
    .eq("id", body.categoryId)
    .eq("community_id", session.activeCommunityId)
    .eq("is_active", true)
    .maybeSingle();

  if (catErr || !category) {
    return json({ error: "category_not_found" }, 404);
  }

  // 3. Update issue's category
  const { error: updateIssueErr } = await admin
    .from("issues")
    .update({ category_id: category.id })
    .eq("id", issue.id);

  if (updateIssueErr) {
    logEvent(
      "error",
      "confirm_category.issue_update_failed",
      describeError(updateIssueErr),
    );
    return json({ error: "server_error" }, 500);
  }

  // 4. Find linked incident
  const { data: link, error: linkErr } = await admin
    .from("incident_issues")
    .select("incident_id")
    .eq("issue_id", issue.id)
    .maybeSingle();

  if (linkErr || !link) {
    return json(
      { success: true, categoryId: category.id, categoryName: category.name },
      200,
    );
  }

  const incidentId = link.incident_id;

  // 5. Update incident category & ensure SLA target is assigned using effective severity
  const { data: incident } = await admin
    .from("incidents")
    .select("id, status, severity, category_id")
    .eq("id", incidentId)
    .single();

  const effectiveSeverity =
    (incident?.severity as "critical" | "high" | "medium" | "low" | null) ??
    "medium";

  await admin
    .from("incidents")
    .update({ category_id: category.id })
    .eq("id", incidentId);

  // 6. If still in 'reported', advance to 'validated' (validation fires upon category confirmation per §6.5)
  if (incident && incident.status === "reported") {
    await admin.rpc("transition_incident", {
      p_incident_id: incidentId,
      p_actor_resident_id: session.resident.id,
      p_to_status: "validated",
      p_category_id: category.id,
      p_assigned_team_id: null,
      p_severity: effectiveSeverity,
      p_note: "Category confirmed by resident.",
    });
  }

  // 7. Always compute/refresh SLA target using effective severity (fixes null-severity bypass)
  await assignIncidentSla(
    admin,
    incidentId,
    session.activeCommunityId,
    category.id,
    effectiveSeverity,
  );

  return json(
    {
      success: true,
      issueId,
      incidentId,
      categoryId: category.id,
      categoryName: category.name,
    },
    200,
  );
}
