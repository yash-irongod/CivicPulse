// GET /api/maintenance/jobs — Staff's assigned work list.
// Returns incidents assigned to teams the authenticated staff member belongs to.
// Only shows incidents in active workflow states (assigned, in_progress,
// resolution_submitted, evidence_checked).

import { NextResponse } from "next/server";

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

// Staff-visible states: the ones where the staff member has work to do
// or is awaiting feedback on their completed work.
const ACTIVE_STATUSES = [
  "assigned",
  "in_progress",
  "resolution_submitted",
  "evidence_checked",
];

export async function GET(): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["maintenance_staff", "committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "maintenance_jobs.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    // 1. Find which teams this staff member belongs to
    const { data: teamMemberships, error: tmError } = await db
      .from("team_members")
      .select("team_id")
      .eq("resident_id", session.resident.id);

    if (tmError) throw tmError;

    const teamIds = (teamMemberships || []).map((tm) => tm.team_id);

    // If the user is a committee_admin, show ALL active incidents in their community
    // (admins oversee all teams). For staff, only show their team's work.
    const isAdmin = session.memberships.some(
      (m) => m.role === "committee_admin",
    );

    let query = db
      .from("incidents")
      .select(
        `
        id,
        canonical_description,
        status,
        severity,
        assigned_team_id,
        category_id,
        sla_target_at,
        created_at,
        category:categories(name),
        team:teams(name)
      `,
      )
      .eq("community_id", session.activeCommunityId)
      .in("status", ACTIVE_STATUSES);

    if (!isAdmin && teamIds.length > 0) {
      query = query.in("assigned_team_id", teamIds);
    } else if (!isAdmin && teamIds.length === 0) {
      // Staff member not assigned to any team — return empty
      return json({ jobs: [] }, 200);
    }

    const { data: incidents, error: incError } = await query;
    if (incError) throw incError;

    type RawIncident = {
      id: string;
      canonical_description: string | null;
      status: string;
      severity: string | null;
      assigned_team_id: string | null;
      category_id: string | null;
      sla_target_at: string | null;
      created_at: string;
      category: { name: string } | Array<{ name: string }> | null;
      team: { name: string } | Array<{ name: string }> | null;
    };

    const jobs = ((incidents as unknown as RawIncident[]) || []).map((inc) => {
      const remaining = inc.sla_target_at
        ? hoursRemaining({ sla_target_at: inc.sla_target_at })
        : null;
      const categoryObj = Array.isArray(inc.category)
        ? inc.category[0]
        : inc.category;
      const teamObj = Array.isArray(inc.team) ? inc.team[0] : inc.team;

      return {
        id: inc.id,
        description: inc.canonical_description,
        status: inc.status,
        severity: inc.severity,
        teamName: teamObj?.name ?? null,
        categoryName: categoryObj?.name ?? null,
        slaTargetAt: inc.sla_target_at,
        hoursRemaining: remaining,
        isOverdue: remaining !== null && remaining < 0,
        createdAt: inc.created_at,
      };
    });

    // Sort: overdue first, then by hours remaining ascending, then by created_at
    jobs.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      if (a.hoursRemaining !== null && b.hoursRemaining !== null) {
        return a.hoursRemaining - b.hoursRemaining;
      }
      if (a.hoursRemaining !== null) return -1;
      if (b.hoursRemaining !== null) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return json({ jobs }, 200);
  } catch (error) {
    logEvent("error", "maintenance_jobs.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
