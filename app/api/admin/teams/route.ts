// GET /api/admin/teams — Team Workload & Pending Verifications (Task 9.4, §7.3, §6.7).
// Aggregates team workloads and lists incidents awaiting human resolution approval.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { getTeamWorkloadStats } from "@/lib/analytics/team-performance";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "teams_api.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    // 1. Team workload stats
    const teams = await getTeamWorkloadStats(db, session.activeCommunityId);

    // 2. Pending verifications: incidents at 'evidence_checked' or 'resolution_submitted'
    const { data: verifications, error: verifError } = await db
      .from("incidents")
      .select(
        `
        id,
        canonical_description,
        status,
        severity,
        assigned_team_id,
        resolution_note,
        resolution_before_photo,
        resolution_after_photo,
        evidence_ai_check,
        created_at,
        team:teams(id, name)
      `,
      )
      .eq("community_id", session.activeCommunityId)
      .in("status", ["evidence_checked", "resolution_submitted"]);

    if (verifError) throw verifError;

    type RawVerificationItem = {
      id: string;
      canonical_description: string | null;
      status: string;
      severity: string | null;
      assigned_team_id: string | null;
      resolution_note: string | null;
      resolution_before_photo: string | null;
      resolution_after_photo: string | null;
      evidence_ai_check: unknown;
      created_at: string;
      team:
        | { id: string; name: string }
        | Array<{ id: string; name: string }>
        | null;
    };

    const formattedVerifications = (
      (verifications as unknown as RawVerificationItem[]) || []
    ).map((v) => {
      const teamObj = Array.isArray(v.team) ? v.team[0] : v.team;
      return {
        id: v.id,
        description: v.canonical_description,
        status: v.status,
        severity: v.severity,
        assignedTeamId: v.assigned_team_id,
        teamName: teamObj?.name ?? null,
        resolutionNotes: v.resolution_note,
        beforePhotoPath: v.resolution_before_photo,
        afterPhotoPath: v.resolution_after_photo,
        aiEvidenceCheck: v.evidence_ai_check,
        createdAt: v.created_at,
      };
    });

    return json({ teams, pendingVerifications: formattedVerifications }, 200);
  } catch (error) {
    logEvent("error", "teams_api.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
