// GET/POST /api/issues/[id]/consolidate — the admin override for Task 4.2's
// default 1:1 incident (§6.6). Both methods require committee_admin or
// maintenance_staff — a plain resident, even the issue's own reporter, has
// no access here (confirmed directly against real Postgres RLS/grants in
// tests/db/incident_consolidation.test.sql: 42501 for `authenticated`).
//
// GET returns candidate OPEN incidents near the issue to merge into — via
// the RLS-respecting client, since this only returns what
// incidents_select_via_membership already lets the caller see.
// POST performs the merge — via a service-role client, since
// merge_issue_into_incident() is service_role-only (0010): a role-gated
// cross-issue write is simpler to trust to "requireRole() already checked
// this" than to re-express as a community-scoped RLS policy. See
// lib/lifecycle/consolidate.ts's header comment for the full reasoning.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import {
  mergeIssueIntoIncident,
  searchOpenIncidentsForIssue,
} from "@/lib/lifecycle/consolidate";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  mergeRequestSchema,
  searchQuerySchema,
} from "@/lib/validation/consolidate";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: issueId } = await params;

  let db;
  try {
    db = await createSupabaseServerClient();
    await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "consolidate.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  // Malformed id -> same 404 as an id the caller may not see (not a 500 from
  // Postgres's 22P02), and only after auth so anonymous callers learn nothing.
  if (!z.guid().safeParse(issueId).success) {
    return json({ error: "issue_not_found" }, 404);
  }

  const query = searchQuerySchema.safeParse({
    radiusMeters: request.nextUrl.searchParams.get("radiusMeters") ?? undefined,
    windowHours: request.nextUrl.searchParams.get("windowHours") ?? undefined,
  });
  if (!query.success) {
    return json({ error: "invalid_query" }, 400);
  }

  const result = await searchOpenIncidentsForIssue(db, issueId, query.data);
  switch (result.kind) {
    case "found":
      return json({ candidates: result.candidates }, 200);
    case "issue_not_found":
      return json({ error: "issue_not_found" }, 404);
    case "error":
      return json({ error: "server_error" }, 500);
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: issueId } = await params;

  let session;
  try {
    const db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "consolidate.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  if (!z.guid().safeParse(issueId).success)
    return json({ error: "not_found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const parsed = mergeRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "invalid_body" }, 400);
  }

  let admin;
  try {
    admin = createSupabaseServiceRoleClient();
  } catch (error) {
    logEvent("error", "consolidate.client_unavailable", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  const result = await mergeIssueIntoIncident(
    admin,
    issueId,
    parsed.data.targetIncidentId,
    session.resident.id,
  );
  switch (result.kind) {
    case "merged":
      return json(
        {
          previousIncidentId: result.previousIncidentId,
          targetIncidentId: result.targetIncidentId,
        },
        200,
      );
    case "not_found":
      return json({ error: "not_found" }, 404);
    case "different_community":
      return json({ error: "different_community" }, 409);
    case "target_not_open":
      return json({ error: "target_not_open" }, 409);
    case "error":
      return json({ error: "server_error" }, 500);
  }
}
