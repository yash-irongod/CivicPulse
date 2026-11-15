// GET /api/admin/dashboard — Community Health & KPI Overview (Task 9.1, §7.2, §7.4).
// Computes versioned community health score and critical counts.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { getCommunityHealthScore } from "@/lib/analytics/health-score";
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
    logEvent("error", "dashboard_api.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    const health = await getCommunityHealthScore(db, session.activeCommunityId);

    // Fetch open counts
    const { count: openCount } = await db
      .from("incidents")
      .select("*", { count: "exact", head: true })
      .eq("community_id", session.activeCommunityId)
      .not("status", "in", '("closed","resolved")');

    const { count: criticalCount } = await db
      .from("incidents")
      .select("*", { count: "exact", head: true })
      .eq("community_id", session.activeCommunityId)
      .eq("severity", "critical")
      .not("status", "in", '("closed","resolved")');

    return json(
      {
        health,
        counts: {
          open: openCount ?? 0,
          critical: criticalCount ?? 0,
          overdue: health.breakdown.rawMetrics.criticalOverdueCount,
          resolved30: health.breakdown.rawMetrics.resolvedTrailing30,
        },
      },
      200,
    );
  } catch (error) {
    logEvent("error", "dashboard_api.failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
