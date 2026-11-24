// POST & DELETE /api/notifications/subscribe — Web Push Subscription Management.
// Allows authenticated residents, staff, and admins to register or unregister their
// browser push subscription tokens (RFC 8291 / PWA Web Push).

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
  keys: z.object({
    p256dh: z.string().min(10).max(500),
    auth: z.string().min(10).max(500),
  }),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2000),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest): Promise<Response> {
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
    logEvent("error", "push_subscribe.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    const raw = await request.json();
    body = subscribeSchema.parse(raw);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  try {
    const admin = createSupabaseServiceRoleClient();

    // Upsert subscription for this resident
    const { error: upsertErr } = await admin.from("push_subscriptions").upsert(
      {
        resident_id: session.resident.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
      },
      { onConflict: "endpoint" },
    );

    if (upsertErr) throw upsertErr;

    logEvent("info", "push_subscribe.registered", {
      residentId: session.resident.id,
    });

    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "push_subscribe.save_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
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
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    const raw = await request.json();
    body = unsubscribeSchema.parse(raw);
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    await admin
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", body.endpoint)
      .eq("resident_id", session.resident.id);

    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "push_unsubscribe.failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
