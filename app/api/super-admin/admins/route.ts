// POST /api/super-admin/admins — Founder invites a Committee Admin (or Chief Admin) to a society.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/auth/log";
import {
  isSuperAdminAuthenticated,
  superAdminUnauthorizedResponse,
} from "@/lib/auth/super-admin-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createAdminSchema = z.object({
  communityId: z.guid(),
  displayName: z.string().trim().min(1).max(100),
  phone: z.string().trim().max(20).optional(),
  preferredLanguage: z.enum(["en", "hi"]).default("en"),
  isChiefAdmin: z.boolean().default(false),
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
    body = createAdminSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "provision_roster_entries",
      {
        p_community_id: body.communityId,
        p_entries: [
          {
            display_name: body.displayName,
            phone: body.phone || null,
            preferred_language: body.preferredLanguage,
            role: "committee_admin",
            is_chief_admin: body.isChiefAdmin,
          },
        ],
        p_valid_days: 30,
      },
    );

    if (rpcErr || !rpcResult || rpcResult.length === 0) {
      logEvent(
        "error",
        "super_admin.invite_admin_failed",
        describeError(rpcErr),
      );
      return json({ error: "provision_failed" }, 500);
    }

    const row = rpcResult[0];
    const origin = request.nextUrl.origin;

    return json(
      {
        success: true,
        invite: {
          id: row.roster_entry_id,
          displayName: row.entry_display_name,
          claimPath: row.claim_path,
          claimUrl: `${origin}${row.claim_path}`,
          expiresAt: row.valid_until,
          isChiefAdmin: body.isChiefAdmin,
        },
      },
      201,
    );
  } catch (err) {
    logEvent("error", "super_admin.invite_admin_exception", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
