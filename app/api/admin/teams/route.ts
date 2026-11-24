// GET /api/admin/teams — Team Workload & Pending Verifications.
// Aggregates team workloads and lists incidents awaiting human resolution approval
// along with signed URLs for before/after resolution proof photos.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { getTeamWorkloadStats } from "@/lib/analytics/team-performance";
import { EVIDENCE_BUCKET, getSignedUrls } from "@/lib/storage/signed-url";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

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
    const teams = await getTeamWorkloadStats(db, session.activeCommunityId);

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

    const rawList = (verifications as unknown as RawVerificationItem[]) || [];

    // Sign all before/after photo keys in one batch
    const photoKeys: string[] = [];
    for (const v of rawList) {
      if (
        v.resolution_before_photo &&
        !photoKeys.includes(v.resolution_before_photo)
      ) {
        photoKeys.push(v.resolution_before_photo);
      }
      if (
        v.resolution_after_photo &&
        !photoKeys.includes(v.resolution_after_photo)
      ) {
        photoKeys.push(v.resolution_after_photo);
      }
    }

    let urlMap: Record<string, string | null> = {};
    if (photoKeys.length > 0) {
      const admin = createSupabaseServiceRoleClient();
      urlMap = await getSignedUrls(admin, EVIDENCE_BUCKET, photoKeys);
    }

    const formattedVerifications = rawList.map((v) => {
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
        beforePhotoUrl: v.resolution_before_photo
          ? (urlMap[v.resolution_before_photo] ?? null)
          : null,
        afterPhotoUrl: v.resolution_after_photo
          ? (urlMap[v.resolution_after_photo] ?? null)
          : null,
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
