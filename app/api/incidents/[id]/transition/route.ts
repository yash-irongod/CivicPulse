// POST /api/incidents/[id]/transition — move an incident through the §6.5
// lifecycle and/or manually set its category, team and severity (Task 4.3).
//
// One endpoint for both, as the plan's file list implies: assignment fields
// ride along as optional body fields, and a body with no `toStatus` is an
// assignment-only call (no transition, no history row).
//
// Role scope (a decision the plan left open, made here): committee_admin and
// maintenance_staff ONLY, for all ten states. §6.4's "Closed requires
// resident confirmation" will be honoured by Phase 8.4's own resident-facing
// feedback endpoint when that UI exists; opening resident_feedback ->
// closed/assigned to the reporting resident now would mean building a
// second, differently-authorised path for a screen that is not built yet.
// Until then an admin records the resident's answer.
//
// Authorization is two layers, neither optional: requireRole() here proves
// the caller is staff SOMEWHERE; transition_incident() (0011) then verifies,
// in the same transaction as the write, that they are active staff in THIS
// incident's community — service_role bypasses RLS, so that check cannot be
// left to it. See lib/lifecycle/state-machine.ts and 0011's header comments.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { dispatchTransitionNotifications } from "@/lib/notify/incident-notify";
import { transitionIncident } from "@/lib/lifecycle/state-machine";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { transitionRequestSchema } from "@/lib/validation/transition";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

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

  const idIsWellFormed = z.guid().safeParse(incidentId).success;

  let db;

  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "transition.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  if (!idIsWellFormed) return json({ error: "not_found" }, 404);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const parsed = transitionRequestSchema.safeParse(body);
  if (!parsed.success) {
    // Codes, not prose — same convention as /api/issues; the admin UI
    // (Phase 9) owns the bilingual wording.
    const code = parsed.error.issues.find((issue) =>
      ["empty_request", "note_requires_transition"].includes(issue.message),
    )?.message;
    return json({ error: code ?? "invalid_body" }, 400);
  }

  let admin;
  try {
    admin = createSupabaseServiceRoleClient();
  } catch (error) {
    logEvent("error", "transition.client_unavailable", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  const result = await transitionIncident(
    { db, admin },
    {
      incidentId,
      actorResidentId: session.resident.id,
      toStatus: parsed.data.toStatus,
      categoryId: parsed.data.categoryId,
      assignedTeamId: parsed.data.assignedTeamId,
      severity: parsed.data.severity,
      note: parsed.data.note,
    },
  );

  switch (result.kind) {
    case "transitioned": {
      // Fire-and-forget notification dispatch
      if (result.fromStatus !== result.toStatus) {
        (async () => {
          let teamName: string | null = null;
          if (parsed.data.assignedTeamId) {
            const { data: team } = await admin
              .from("teams")
              .select("name")
              .eq("id", parsed.data.assignedTeamId)
              .maybeSingle();
            teamName = team?.name ?? null;
          }

          await dispatchTransitionNotifications(admin, {
            incidentId: result.incidentId,
            fromStatus: result.fromStatus,
            toStatus: result.toStatus,
            communityId: session.activeCommunityId,
            assignedTeamName: teamName,
          });
        })().catch((err) => {
          logEvent("warn", "transition.notify_failed", describeError(err));
        });
      }

      return json(
        {
          incidentId: result.incidentId,
          fromStatus: result.fromStatus,
          toStatus: result.toStatus,
          historyId: result.historyId,
        },
        200,
      );
    }
    case "invalid_transition":
      return json(
        {
          error: "invalid_transition",
          from: result.from,
          to: result.to,
          allowed: result.allowed,
        },
        409,
      );
    case "not_found":
      return json({ error: "not_found" }, 404);
    case "invalid_assignment":
      return json({ error: "invalid_assignment" }, 422);
    case "error":
      return json({ error: "server_error" }, 500);
  }
}
