// PUT /api/admin/sla — Upsert per-category, per-severity SLA target hours.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { severitySchema } from "@/lib/validation/transition";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const upsertSlaSchema = z.object({
  categoryId: z.guid(),
  severity: severitySchema,
  targetHours: z.coerce.number().int().min(1).max(2160),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function PUT(request: NextRequest): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    body = upsertSlaSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: cat } = await admin
      .from("categories")
      .select("id, community_id")
      .eq("id", body.categoryId)
      .maybeSingle();

    if (!cat || cat.community_id !== communityId) {
      return json({ error: "not_found" }, 404);
    }

    const { data: saved, error: upsertErr } = await admin
      .from("sla_policies")
      .upsert(
        {
          community_id: communityId,
          category_id: body.categoryId,
          severity: body.severity,
          target_hours: body.targetHours,
        },
        { onConflict: "community_id,category_id,severity" },
      )
      .select("id, category_id, severity, target_hours")
      .single();

    if (upsertErr) throw upsertErr;

    return json(
      {
        success: true,
        policy: {
          id: saved.id,
          categoryId: saved.category_id,
          severity: saved.severity,
          targetHours: saved.target_hours,
        },
      },
      200,
    );
  } catch (err) {
    logEvent("error", "admin_sla.upsert_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
