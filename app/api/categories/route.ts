// GET /api/categories — list active categories for the authenticated user's community.
// Accessible to residents, committee admins, and maintenance staff.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
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
    session = await requireRole(
      ["resident", "committee_admin", "maintenance_staff"],
      db,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "categories.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    const { data: categories, error } = await db
      .from("categories")
      .select("id, name")
      .eq("community_id", session.activeCommunityId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error) throw error;

    return json({ categories: categories ?? [] }, 200);
  } catch (error) {
    logEvent("error", "categories.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
