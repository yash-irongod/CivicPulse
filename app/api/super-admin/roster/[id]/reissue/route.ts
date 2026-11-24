// POST /api/super-admin/roster/[id]/reissue — Founder lost-device recovery link generator.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/auth/log";
import {
  isSuperAdminAuthenticated,
  superAdminUnauthorizedResponse,
} from "@/lib/auth/super-admin-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  if (!(await isSuperAdminAuthenticated())) {
    return superAdminUnauthorizedResponse();
  }

  const { id: rosterEntryId } = await params;
  if (!z.guid().safeParse(rosterEntryId).success) {
    return json({ error: "not_found" }, 404);
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "reissue_roster_claim",
      {
        p_roster_entry_id: rosterEntryId,
        p_valid_days: 30,
        p_allow_device_transfer: true,
      },
    );

    if (rpcErr || !rpcResult || rpcResult.length === 0) {
      logEvent("error", "super_admin.reissue_failed", describeError(rpcErr));
      return json({ error: "reissue_failed" }, 500);
    }

    const row = rpcResult[0];
    const origin = request.nextUrl.origin;

    return json(
      {
        success: true,
        claimPath: row.claim_path,
        claimUrl: `${origin}${row.claim_path}`,
        expiresAt: row.valid_until,
      },
      200,
    );
  } catch (err) {
    logEvent("error", "super_admin.reissue_exception", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
