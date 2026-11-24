// POST /api/super-admin/admins/transfer-chief — Founder promotes an active society member to Chief Admin.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/auth/log";
import {
  isSuperAdminAuthenticated,
  superAdminUnauthorizedResponse,
} from "@/lib/auth/super-admin-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const transferSchema = z.object({
  communityId: z.guid(),
  residentId: z.guid(),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await isSuperAdminAuthenticated())) {
    return superAdminUnauthorizedResponse();
  }

  let body;
  try {
    body = transferSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    const { error: rpcErr } = await admin.rpc("transfer_chief_admin", {
      p_community_id: body.communityId,
      p_to_resident_id: body.residentId,
      p_actor_resident_id: null,
    });

    if (rpcErr) {
      logEvent(
        "error",
        "super_admin.transfer_chief_failed",
        describeError(rpcErr),
      );
      return json({ error: "transfer_failed" }, 400);
    }

    return json({ success: true }, 200);
  } catch (err) {
    logEvent(
      "error",
      "super_admin.transfer_chief_exception",
      describeError(err),
    );
    return json({ error: "server_error" }, 500);
  }
}
