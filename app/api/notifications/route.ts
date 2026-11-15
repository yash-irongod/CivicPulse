// GET /api/notifications — In-App Notifications Inbox (Task 6.1, Task 8.4).
// Returns user notifications scoped by resident and community.

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
    logEvent("error", "notifications.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    const { data: notifications, error } = await db
      .from("notifications")
      .select("id, type, title, body, payload, read, created_at")
      .eq("resident_id", session.resident.id)
      .eq("community_id", session.activeCommunityId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    return json({ notifications: notifications ?? [] }, 200);
  } catch (error) {
    logEvent("error", "notifications.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
