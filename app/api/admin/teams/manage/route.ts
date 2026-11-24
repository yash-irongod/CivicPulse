// GET, POST, PATCH, DELETE /api/admin/teams/manage — Zero-SQL Team, Category Mapping & SLA config.

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

const createTeamSchema = z.object({
  name: z.string().trim().min(1, "Team name is required").max(80),
  categoryIds: z.array(z.guid()).default([]),
});

const patchTeamSchema = z
  .object({
    teamId: z.guid(),
    name: z.string().trim().min(1).max(80).optional(),
    categoryIds: z.array(z.guid()).optional(),
  })
  .refine((v) => v.name !== undefined || v.categoryIds !== undefined, {
    message: "empty_update",
  });

const deleteTeamSchema = z.object({
  teamId: z.guid(),
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

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const [
      { data: teams, error: teamsErr },
      { data: categories, error: catErr },
      { data: slaPolicies, error: slaErr },
    ] = await Promise.all([
      admin
        .from("teams")
        .select("id, name, created_at")
        .eq("community_id", communityId)
        .order("name", { ascending: true }),
      admin
        .from("categories")
        .select("id, name, is_active")
        .eq("community_id", communityId)
        .order("name", { ascending: true }),
      admin
        .from("sla_policies")
        .select("id, category_id, severity, target_hours")
        .eq("community_id", communityId),
    ]);

    if (teamsErr) throw teamsErr;
    if (catErr) throw catErr;
    if (slaErr) throw slaErr;

    const teamList = teams || [];
    const teamIds = teamList.map((t) => t.id as string);

    const categoryMap = new Map<string, string[]>();
    const memberCountMap = new Map<string, number>();

    if (teamIds.length > 0) {
      const [{ data: tcRows, error: tcErr }, { data: tmRows, error: tmErr }] =
        await Promise.all([
          admin
            .from("team_categories")
            .select("team_id, category_id")
            .in("team_id", teamIds),
          admin
            .from("team_members")
            .select("team_id, resident_id")
            .in("team_id", teamIds),
        ]);

      if (tcErr) throw tcErr;
      if (tmErr) throw tmErr;

      for (const tc of tcRows || []) {
        const list = categoryMap.get(tc.team_id as string) ?? [];
        list.push(tc.category_id as string);
        categoryMap.set(tc.team_id as string, list);
      }

      for (const tm of tmRows || []) {
        const tId = tm.team_id as string;
        memberCountMap.set(tId, (memberCountMap.get(tId) ?? 0) + 1);
      }
    }

    return json(
      {
        teams: teamList.map((t) => ({
          id: t.id,
          name: t.name,
          categoryIds: categoryMap.get(t.id as string) ?? [],
          memberCount: memberCountMap.get(t.id as string) ?? 0,
        })),
        categories: (categories || []).map((c) => ({
          id: c.id,
          name: c.name,
          isActive: Boolean(c.is_active),
        })),
        slaPolicies: (slaPolicies || []).map((p) => ({
          id: p.id,
          categoryId: p.category_id,
          severity: p.severity,
          targetHours: p.target_hours,
        })),
      },
      200,
    );
  } catch (err) {
    logEvent("error", "teams_manage.fetch_failed", describeError(err));
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
    body = createTeamSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: existing } = await admin
      .from("teams")
      .select("id")
      .eq("community_id", communityId)
      .ilike("name", body.name)
      .maybeSingle();

    if (existing) {
      return json({ error: "already_exists" }, 409);
    }

    const uniqueCategoryIds = Array.from(new Set(body.categoryIds));
    if (uniqueCategoryIds.length > 0) {
      const { data: validCats, error: catCheckErr } = await admin
        .from("categories")
        .select("id")
        .eq("community_id", communityId)
        .in("id", uniqueCategoryIds);

      if (catCheckErr) throw catCheckErr;
      if ((validCats || []).length !== uniqueCategoryIds.length) {
        return json({ error: "invalid_categories" }, 400);
      }
    }

    const { data: created, error: createErr } = await admin
      .from("teams")
      .insert({
        community_id: communityId,
        name: body.name,
      })
      .select("id, name")
      .single();

    if (createErr) throw createErr;

    if (uniqueCategoryIds.length > 0) {
      const { error: mapErr } = await admin.from("team_categories").insert(
        uniqueCategoryIds.map((catId) => ({
          team_id: created.id,
          category_id: catId,
        })),
      );
      if (mapErr) throw mapErr;
    }

    return json(
      {
        success: true,
        team: {
          id: created.id,
          name: created.name,
          categoryIds: uniqueCategoryIds,
          memberCount: 0,
        },
      },
      201,
    );
  } catch (err) {
    logEvent("error", "teams_manage.create_failed", describeError(err));
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
    body = patchTeamSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: target } = await admin
      .from("teams")
      .select("id, community_id")
      .eq("id", body.teamId)
      .maybeSingle();

    if (!target || target.community_id !== communityId) {
      return json({ error: "not_found" }, 404);
    }

    if (body.name !== undefined) {
      const { data: dup } = await admin
        .from("teams")
        .select("id")
        .eq("community_id", communityId)
        .ilike("name", body.name)
        .neq("id", body.teamId)
        .maybeSingle();

      if (dup) {
        return json({ error: "already_exists" }, 409);
      }

      const { error: renameErr } = await admin
        .from("teams")
        .update({ name: body.name })
        .eq("id", body.teamId)
        .eq("community_id", communityId);

      if (renameErr) throw renameErr;
    }

    if (body.categoryIds !== undefined) {
      const uniqueCategoryIds = Array.from(new Set(body.categoryIds));
      if (uniqueCategoryIds.length > 0) {
        const { data: validCats, error: catErr } = await admin
          .from("categories")
          .select("id")
          .eq("community_id", communityId)
          .in("id", uniqueCategoryIds);

        if (catErr) throw catErr;
        if ((validCats || []).length !== uniqueCategoryIds.length) {
          return json({ error: "invalid_categories" }, 400);
        }
      }

      const { error: delErr } = await admin
        .from("team_categories")
        .delete()
        .eq("team_id", body.teamId);
      if (delErr) throw delErr;

      if (uniqueCategoryIds.length > 0) {
        const { error: insErr } = await admin.from("team_categories").insert(
          uniqueCategoryIds.map((catId) => ({
            team_id: body.teamId,
            category_id: catId,
          })),
        );
        if (insErr) throw insErr;
      }
    }

    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "teams_manage.update_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function DELETE(request: NextRequest): Promise<Response> {
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
    body = deleteTeamSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const communityId = session.activeCommunityId;
  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: target } = await admin
      .from("teams")
      .select("id, community_id")
      .eq("id", body.teamId)
      .maybeSingle();

    if (!target || target.community_id !== communityId) {
      return json({ error: "not_found" }, 404);
    }

    const { data: linkedIncidents } = await admin
      .from("incidents")
      .select("id")
      .eq("community_id", communityId)
      .eq("assigned_team_id", body.teamId)
      .limit(1);

    if (linkedIncidents && linkedIncidents.length > 0) {
      return json({ error: "team_has_incidents" }, 409);
    }

    const { error: delErr } = await admin
      .from("teams")
      .delete()
      .eq("id", body.teamId)
      .eq("community_id", communityId);

    if (delErr) throw delErr;
    return json({ success: true }, 200);
  } catch (err) {
    logEvent("error", "teams_manage.delete_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
