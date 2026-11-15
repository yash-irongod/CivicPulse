// GET /api/admin/analytics — Recurrence Hotspots & Category Breakdown (Task 9.5, §7.1).
// Provides deterministic recurrence list and category volume stats.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { getRecurrenceHotspots } from "@/lib/analytics/recurrence";
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
    logEvent("error", "analytics_api.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    // 1. Recurrence hotspots (deterministic N >= 3 incidents in M = 90 days)
    const hotspots = await getRecurrenceHotspots(db, session.activeCommunityId);

    // 2. Category volume breakdown
    const { data: incidents, error: incError } = await db
      .from("incidents")
      .select(
        `
        category_id,
        severity,
        category:categories(name)
      `,
      )
      .eq("community_id", session.activeCommunityId);

    if (incError) throw incError;

    type CategoryItem = {
      category_id: string | null;
      severity: string | null;
      category: { name: string } | Array<{ name: string }> | null;
    };

    const categoryCounts = new Map<
      string,
      { name: string; count: number; critical: number }
    >();

    for (const item of (incidents as unknown as CategoryItem[]) || []) {
      const catObj = Array.isArray(item.category)
        ? item.category[0]
        : item.category;
      const catName = catObj?.name || "Uncategorized";
      const key = item.category_id || "uncategorized";

      const current = categoryCounts.get(key) || {
        name: catName,
        count: 0,
        critical: 0,
      };
      current.count += 1;
      if (item.severity === "critical") current.critical += 1;
      categoryCounts.set(key, current);
    }

    const categories = Array.from(categoryCounts.values()).sort(
      (a, b) => b.count - a.count,
    );

    return json({ hotspots, categories }, 200);
  } catch (error) {
    logEvent("error", "analytics_api.failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
