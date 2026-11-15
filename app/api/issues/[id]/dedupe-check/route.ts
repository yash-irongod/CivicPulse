// POST /api/issues/[id]/dedupe-check — Run duplicate detection on an issue (Task 5.2, §6.6).
// Compares against candidate open incidents using geospatial, temporal, and semantic similarity.
// Applies 3-way split: auto-merge, flag as possible duplicate, or create new.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { evaluateDuplicate } from "@/lib/ai/dedupe";
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
  const { id: issueId } = await params;

  if (!z.guid().safeParse(issueId).success) {
    return json({ error: "not_found" }, 404);
  }

  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "dedupe_check.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  // Load issue details
  const { data: issue, error: issueError } = await db
    .from("issues")
    .select("id, community_id, category_id, geo, raw_text")
    .eq("id", issueId)
    .maybeSingle();

  if (issueError || !issue) {
    return json({ error: "issue_not_found" }, 404);
  }

  const decision = await evaluateDuplicate(db, {
    id: issue.id,
    communityId: issue.community_id,
    categoryId: issue.category_id,
    geo: issue.geo,
    text: issue.raw_text,
  });

  const admin = createSupabaseServiceRoleClient();

  if (decision.action === "auto_merge") {
    try {
      // Reparent issue to target incident using merge_issue_into_incident RPC
      const { error: mergeError } = await admin.rpc(
        "merge_issue_into_incident",
        {
          p_issue_id: issue.id,
          p_target_incident_id: decision.targetIncidentId,
          p_actor_resident_id: session.resident.id,
        },
      );
      if (mergeError) throw mergeError;
    } catch (err) {
      logEvent("error", "dedupe_check.auto_merge_failed", describeError(err));
      return json({ error: "merge_failed" }, 500);
    }
  } else if (decision.action === "flag_duplicate") {
    // Look up the incident linked to this issue and set possible_duplicate_of pointer
    try {
      const { data: linkData } = await admin
        .from("incident_issues")
        .select("incident_id")
        .eq("issue_id", issue.id)
        .maybeSingle();

      if (linkData?.incident_id) {
        await admin
          .from("incidents")
          .update({ possible_duplicate_of: decision.possibleDuplicateOf })
          .eq("id", linkData.incident_id);
      }
    } catch (err) {
      logEvent("warn", "dedupe_check.flag_pointer_failed", describeError(err));
    }
  }

  return json(
    {
      decision,
    },
    200,
  );
}
