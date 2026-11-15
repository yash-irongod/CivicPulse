// PATCH /api/notifications/[id]/read — Mark a notification as read (Task 8.4).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PATCH(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: notificationId } = await params;

  if (!z.guid().safeParse(notificationId).success) {
    return json({ error: "not_found" }, 404);
  }

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
    logEvent("error", "notification_read.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    const { error } = await db
      .from("notifications")
      .update({ read: true })
      .eq("id", notificationId)
      .eq("resident_id", session.resident.id);

    if (error) throw error;

    return json({ success: true, notificationId }, 200);
  } catch (error) {
    logEvent("error", "notification_read.failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
