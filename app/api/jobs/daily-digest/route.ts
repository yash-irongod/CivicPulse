// POST /api/jobs/daily-digest — Daily operations digest trigger (Task 6.2).
// Protected by CRON_SECRET bearer token.

import { NextResponse, type NextRequest } from "next/server";

import { describeError, logEvent } from "@/lib/auth/log";
import { runDailyDigest } from "@/lib/jobs/daily-digest";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // In production, CRON_SECRET must be set — no open access.
  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") return false;
    // In development, allow without secret for local testing.
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    const result = await runDailyDigest(admin);
    logEvent("info", "jobs.daily_digest_completed", { ...result });
    return NextResponse.json({ success: true, ...result }, { status: 200 });
  } catch (err) {
    logEvent("error", "jobs.daily_digest_failed", describeError(err));
    return NextResponse.json({ error: "job_failed" }, { status: 500 });
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return POST(request);
}
