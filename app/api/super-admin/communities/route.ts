// GET & POST /api/super-admin/communities — Founder multi-society directory & creation.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/auth/log";
import {
  isSuperAdminAuthenticated,
  superAdminUnauthorizedResponse,
} from "@/lib/auth/super-admin-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const createSocietySchema = z.object({
  name: z.string().trim().min(2, "Society name is required").max(120),
  defaultLanguage: z.enum(["en", "hi"]).default("en"),
  seedStarter: z.boolean().default(true),
  initialSpaces: z.array(z.string().trim().min(1).max(100)).default([]),
  chiefAdminName: z.string().trim().min(1).max(100).optional(),
  chiefAdminPhone: z.string().trim().max(20).optional(),
  chiefAdminLanguage: z.enum(["en", "hi"]).optional(),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(): Promise<Response> {
  if (!(await isSuperAdminAuthenticated())) {
    return superAdminUnauthorizedResponse();
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    const [
      { data: communities, error: commErr },
      { data: memberships, error: memErr },
      { data: rosterEntries, error: rosterErr },
      { data: incidents, error: incErr },
      { data: spaces, error: spaceErr },
      { data: teams, error: teamErr },
      { data: categories, error: catErr },
    ] = await Promise.all([
      admin
        .from("communities")
        .select("id, name, default_language, created_at")
        .order("created_at", { ascending: false }),
      admin
        .from("memberships")
        .select(
          "community_id, resident_id, role, status, is_chief_admin, resident:residents(id, display_name, phone)",
        )
        .eq("status", "active"),
      admin
        .from("roster_entries")
        .select(
          "id, community_id, resident_id, display_name, phone, preferred_language, status, intended_role, is_chief_admin, claim_token_expires_at, claimed_at, created_at",
        )
        .order("created_at", { ascending: false }),
      admin.from("incidents").select("community_id, status"),
      admin.from("spaces").select("community_id"),
      admin.from("teams").select("community_id"),
      admin.from("categories").select("community_id, is_active"),
    ]);

    if (commErr) throw commErr;
    if (memErr) throw memErr;
    if (rosterErr) throw rosterErr;
    if (incErr) throw incErr;
    if (spaceErr) throw spaceErr;
    if (teamErr) throw teamErr;
    if (catErr) throw catErr;

    const list = (communities || []).map((c) => {
      const commId = c.id as string;
      const commMems = (memberships || []).filter(
        (m) => m.community_id === commId,
      );
      const uniqueActiveResidents = new Set(
        commMems.map((m) => m.resident_id as string),
      );
      const openIncidentsCount = (incidents || []).filter(
        (i) => i.community_id === commId && i.status !== "closed",
      ).length;
      const spacesCount = (spaces || []).filter(
        (s) => s.community_id === commId,
      ).length;
      const teamsCount = (teams || []).filter(
        (t) => t.community_id === commId,
      ).length;
      const categoriesCount = (categories || []).filter(
        (cat) => cat.community_id === commId && cat.is_active,
      ).length;

      // Build unified admin directory for this society (active admins + pending/revoked admin roster invites)
      const commRoster = (rosterEntries || []).filter(
        (r) => r.community_id === commId,
      );
      const liveAdminByResident = new Map<
        string,
        { isChiefAdmin: boolean; displayName?: string; phone?: string | null }
      >();

      for (const m of commMems) {
        if (m.role !== "committee_admin") continue;
        const resRaw = m.resident as unknown;
        const res = Array.isArray(resRaw)
          ? (resRaw[0] as
              { display_name?: string; phone?: string | null } | undefined)
          : (resRaw as { display_name?: string; phone?: string | null } | null);
        liveAdminByResident.set(m.resident_id as string, {
          isChiefAdmin: Boolean(m.is_chief_admin),
          displayName: res?.display_name,
          phone: res?.phone,
        });
      }

      const seenResidentIds = new Set<string>();
      const admins: Array<{
        rosterEntryId: string | null;
        residentId: string | null;
        displayName: string;
        phone: string | null;
        status: string;
        isChiefAdmin: boolean;
        expiresAt: string | null;
      }> = [];

      for (const r of commRoster) {
        const resId = r.resident_id as string | null;
        const liveAdmin = resId ? liveAdminByResident.get(resId) : undefined;
        const isAdminEntry =
          Boolean(liveAdmin) ||
          r.intended_role === "committee_admin" ||
          Boolean(r.is_chief_admin);

        if (!isAdminEntry) continue;
        if (resId) seenResidentIds.add(resId);

        admins.push({
          rosterEntryId: r.id as string,
          residentId: resId,
          displayName: liveAdmin?.displayName ?? (r.display_name as string),
          phone: liveAdmin?.phone ?? (r.phone as string | null),
          status: r.status as string,
          isChiefAdmin: Boolean(liveAdmin?.isChiefAdmin ?? r.is_chief_admin),
          expiresAt: r.claim_token_expires_at as string | null,
        });
      }

      // Include any SQL-seeded admins that don't have a roster_entries row
      for (const [resId, info] of liveAdminByResident.entries()) {
        if (seenResidentIds.has(resId)) continue;
        admins.push({
          rosterEntryId: null,
          residentId: resId,
          displayName: info.displayName ?? "Committee Admin",
          phone: info.phone ?? null,
          status: "claimed",
          isChiefAdmin: info.isChiefAdmin,
          expiresAt: null,
        });
      }

      admins.sort((a, b) => Number(b.isChiefAdmin) - Number(a.isChiefAdmin));

      return {
        id: commId,
        name: c.name as string,
        defaultLanguage: c.default_language as "en" | "hi",
        createdAt: c.created_at as string,
        stats: {
          activeMembers: uniqueActiveResidents.size,
          openIncidents: openIncidentsCount,
          spacesCount,
          teamsCount,
          categoriesCount,
        },
        admins,
      };
    });

    return json({ communities: list }, 200);
  } catch (err) {
    logEvent(
      "error",
      "super_admin.communities_fetch_failed",
      describeError(err),
    );
    return json({ error: "server_error" }, 500);
  }
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!(await isSuperAdminAuthenticated())) {
    return superAdminUnauthorizedResponse();
  }

  let body;
  try {
    body = createSocietySchema.parse(await request.json());
  } catch (e) {
    if (e instanceof z.ZodError) {
      return json(
        { error: "invalid_input", details: e.flatten().fieldErrors },
        400,
      );
    }
    return json({ error: "invalid_body" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();

  try {
    const { data: rpcResult, error: rpcErr } = await admin.rpc(
      "create_society_workspace",
      {
        p_name: body.name,
        p_default_language: body.defaultLanguage,
        p_seed_starter: body.seedStarter,
        p_space_names: body.initialSpaces,
        p_admin_name: body.chiefAdminName ?? null,
        p_admin_phone: body.chiefAdminPhone ?? null,
        p_admin_language: body.chiefAdminLanguage ?? body.defaultLanguage,
        p_valid_days: 30,
      },
    );

    if (rpcErr || !rpcResult || rpcResult.length === 0) {
      logEvent(
        "error",
        "super_admin.create_society_failed",
        describeError(rpcErr),
      );
      return json({ error: rpcErr?.message || "create_society_failed" }, 500);
    }

    const row = rpcResult[0];
    const origin = request.nextUrl.origin;

    return json(
      {
        success: true,
        communityId: row.community_id,
        communityName: row.community_name,
        chiefAdminInvite: row.claim_path
          ? {
              rosterEntryId: row.roster_entry_id,
              claimPath: row.claim_path,
              claimUrl: `${origin}${row.claim_path}`,
              expiresAt: row.valid_until,
            }
          : null,
      },
      201,
    );
  } catch (err) {
    logEvent(
      "error",
      "super_admin.create_society_exception",
      describeError(err),
    );
    return json({ error: "server_error" }, 500);
  }
}
