// GET /api/admin/incidents — Admin Incident Queue API (Task 9.2, §7.2, §7.4).
// SLA-sorted (overdue first via hoursRemaining), filterable by category, team, and status.
// Includes duplicate suggestions and left-edge severity metadata.

import { NextResponse, type NextRequest } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { hoursRemaining } from "@/lib/lifecycle/sla";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const categoryFilter = searchParams.get("category");
  const teamFilter = searchParams.get("team");
  const statusFilter = searchParams.get("status");

  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "admin_incidents.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    let query = db

      .from("incidents")
      .select(
        `
        id,
        community_id,
        canonical_description,
        status,
        severity,
        assigned_team_id,
        category_id,
        sla_target_at,
        possible_duplicate_of,
        resolution_notes,
        before_photo_path,
        after_photo_path,
        ai_evidence_check,
        created_at,
        resolved_at,
        closed_at,
        category:categories(id, name),
        team:teams(id, name)
      `,
      )
      .eq("community_id", session.activeCommunityId);

    if (categoryFilter) {
      query = query.eq("category_id", categoryFilter);
    }
    if (teamFilter) {
      query = query.eq("assigned_team_id", teamFilter);
    }
    if (statusFilter) {
      query = query.eq("status", statusFilter);
    }

    const { data: rawIncidents, error: incError } = await query;
    if (incError) throw incError;

    type RawIncidentItem = {
      id: string;
      community_id: string;
      canonical_description: string | null;
      status: string;
      severity: string | null;
      assigned_team_id: string | null;
      category_id: string | null;
      sla_target_at: string | null;
      possible_duplicate_of: string | null;
      resolution_notes: string | null;
      before_photo_path: string | null;
      after_photo_path: string | null;
      ai_evidence_check: unknown;
      created_at: string;
      resolved_at: string | null;
      closed_at: string | null;
      category:
        | { id: string; name: string }
        | Array<{ id: string; name: string }>
        | null;
      team:
        | { id: string; name: string }
        | Array<{ id: string; name: string }>
        | null;
    };

    const formatted = (
      (rawIncidents as unknown as RawIncidentItem[]) || []
    ).map((inc) => {
      const remaining = inc.sla_target_at
        ? hoursRemaining({ sla_target_at: inc.sla_target_at })
        : null;

      const categoryObj = Array.isArray(inc.category)
        ? inc.category[0]
        : inc.category;
      const teamObj = Array.isArray(inc.team) ? inc.team[0] : inc.team;

      return {
        id: inc.id,
        canonicalDescription: inc.canonical_description,
        status: inc.status,
        severity: inc.severity,
        assignedTeamId: inc.assigned_team_id,
        teamName: teamObj?.name ?? null,
        categoryId: inc.category_id,
        categoryName: categoryObj?.name ?? null,
        slaTargetAt: inc.sla_target_at,
        hoursRemaining: remaining,
        isOverdue: remaining !== null && remaining < 0,
        possibleDuplicateOf: inc.possible_duplicate_of,
        resolutionNotes: inc.resolution_notes,
        beforePhotoPath: inc.before_photo_path,
        afterPhotoPath: inc.after_photo_path,
        aiEvidenceCheck: inc.ai_evidence_check,
        createdAt: inc.created_at,
        resolvedAt: inc.resolved_at,
        closedAt: inc.closed_at,
      };
    });

    // SLA sorting per §9.2:
    // 1. Overdue first (negative hoursRemaining ascending, e.g. -12 before -2)
    // 2. Open with SLA ascending (closest deadline first)
    // 3. Open without SLA
    // 4. Closed/Resolved last
    formatted.sort((a, b) => {
      const isTerminalA = a.status === "closed" || a.status === "resolved";
      const isTerminalB = b.status === "closed" || b.status === "resolved";
      if (isTerminalA && !isTerminalB) return 1;
      if (!isTerminalA && isTerminalB) return -1;

      // Both open or both closed:
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;

      if (a.hoursRemaining !== null && b.hoursRemaining !== null) {
        return a.hoursRemaining - b.hoursRemaining;
      }
      if (a.hoursRemaining !== null && b.hoursRemaining === null) return -1;
      if (a.hoursRemaining === null && b.hoursRemaining !== null) return 1;

      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return json({ incidents: formatted }, 200);
  } catch (error) {
    logEvent("error", "admin_incidents.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
