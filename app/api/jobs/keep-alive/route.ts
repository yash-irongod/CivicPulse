// GET & POST /api/jobs/keep-alive — Daily Cron for Keep-Alive & Housekeeping.
// Prevents Supabase free-tier project from pausing after inactivity.
// Also performs automated storage cleanup for closed tickets past 90 days
// and dispatches the daily community digest.
// Protected by CRON_SECRET bearer token. Scheduled once daily in vercel.json.

import { NextResponse, type NextRequest } from "next/server";

import { describeError, logEvent } from "@/lib/auth/log";
import { runDailyDigest } from "@/lib/jobs/daily-digest";
import { runStorageCleanup } from "@/lib/jobs/storage-cleanup";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function isAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") return false;
    // In development / local testing, allow without secret
    return true;
  }

  const authHeader = request.headers.get("authorization");
  return authHeader === `Bearer ${cronSecret}`;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const startTime = Date.now();
  try {
    const admin = createSupabaseServiceRoleClient();

    // 1. Keep-Alive: simple query to ensure Supabase DB stays active
    const { count: communityCount, error: pingError } = await admin
      .from("communities")
      .select("id", { count: "exact", head: true });

    if (pingError) throw pingError;

    // 2. Automated Storage Cleanup: remove photos of tickets closed > 90 days ago
    const cleanupResult = await runStorageCleanup(admin);

    // 3. Daily Operations Digest
    const digestResult = await runDailyDigest(admin);

    const durationMs = Date.now() - startTime;
    logEvent("info", "jobs.keep_alive_success", {
      communities: communityCount ?? 0,
      durationMs,
      cleanedPhotos: cleanupResult.cleanedPhotosCount,
    });

    return NextResponse.json(
      {
        success: true,
        timestamp: new Date().toISOString(),
        durationMs,
        ping: "ok",
        communities: communityCount,
        cleanup: cleanupResult,
        digest: digestResult,
      },
      { status: 200 },
    );
  } catch (err) {
    logEvent("error", "jobs.keep_alive_failed", describeError(err));
    return NextResponse.json(
      { error: "job_failed", details: String(err) },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest): Promise<Response> {
  return POST(request);
}
