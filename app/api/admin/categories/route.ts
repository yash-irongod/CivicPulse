// GET, POST, PATCH /api/admin/categories — Manage society complaint categories in-app.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { DEFAULT_SLA_HOURS } from "@/lib/lifecycle/sla";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createCategorySchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(80),
});

const patchCategorySchema = z
  .object({
    categoryId: z.guid(),
    name: z.string().trim().min(1).max(80).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.isActive !== undefined, {
    message: "empty_update",
  });

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
    session = await requireRole(["committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  const admin = createSupabaseServiceRoleClient();
  try {
    const { data, error } = await admin
      .from("categories")
      .select("id, name, is_active, created_at")
      .eq("community_id", session.activeCommunityId)
      .order("name", { ascending: true });

    if (error) throw error;
    return json(
      {
        categories: (data || []).map((c) => ({
          id: c.id,
          name: c.name,
          isActive: Boolean(c.is_active),
        })),
      },
      200,
    );
  } catch (err) {
    logEvent("error", "admin_categories.fetch_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
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
    body = createCategorySchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: existing } = await admin
      .from("categories")
      .select("id, name")
      .eq("community_id", communityId)
      .ilike("name", body.name)
      .maybeSingle();

    if (existing) {
      return json({ error: "already_exists" }, 409);
    }

    const { data: created, error: insertErr } = await admin
      .from("categories")
      .insert({
        community_id: communityId,
        name: body.name,
        is_active: true,
      })
      .select("id, name, is_active")
      .single();

    if (insertErr) throw insertErr;

    // Seed baseline SLA rows automatically so admins can customize without blank fields
    const defaultPolicies = (
      Object.entries(DEFAULT_SLA_HOURS) as Array<
        [keyof typeof DEFAULT_SLA_HOURS, number]
      >
    ).map(([severity, targetHours]) => ({
      community_id: communityId,
      category_id: created.id,
      severity,
      target_hours: targetHours,
    }));

    const { error: slaErr } = await admin
      .from("sla_policies")
      .insert(defaultPolicies);
    if (slaErr) {
      logEvent(
        "warn",
        "admin_categories.sla_seed_failed",
        describeError(slaErr),
      );
    }

    return json(
      {
        success: true,
        category: {
          id: created.id,
          name: created.name,
          isActive: Boolean(created.is_active),
        },
      },
      201,
    );
  } catch (err) {
    logEvent("error", "admin_categories.create_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function PATCH(request: NextRequest): Promise<Response> {
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
    body = patchCategorySchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: target } = await admin
      .from("categories")
      .select("id, community_id")
      .eq("id", body.categoryId)
      .maybeSingle();

    if (!target || target.community_id !== communityId) {
      return json({ error: "not_found" }, 404);
    }

    if (body.name !== undefined) {
      const { data: dup } = await admin
        .from("categories")
        .select("id")
        .eq("community_id", communityId)
        .ilike("name", body.name)
        .neq("id", body.categoryId)
        .maybeSingle();

      if (dup) {
        return json({ error: "already_exists" }, 409);
      }
    }

    const updateFields: Record<string, unknown> = {};
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.isActive !== undefined) updateFields.is_active = body.isActive;

    const { data: updated, error: updateErr } = await admin
      .from("categories")
      .update(updateFields)
      .eq("id", body.categoryId)
      .eq("community_id", communityId)
      .select("id, name, is_active")
      .single();

    if (updateErr) throw updateErr;

    return json(
      {
        success: true,
        category: {
          id: updated.id,
          name: updated.name,
          isActive: Boolean(updated.is_active),
        },
      },
      200,
    );
  } catch (err) {
    logEvent("error", "admin_categories.update_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
