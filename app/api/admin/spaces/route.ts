// GET & POST /api/admin/spaces — List and add flats/spaces in the community.

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

const createSpaceSchema = z.object({
  name: z.string().trim().min(1, "Space/flat name is required").max(100),
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
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  const admin = createSupabaseServiceRoleClient();
  try {
    const { data: spaces, error } = await admin
      .from("spaces")
      .select("id, name, created_at")
      .eq("community_id", session.activeCommunityId)
      .order("name", { ascending: true });

    if (error) throw error;
    return json({ spaces: spaces || [] }, 200);
  } catch (err) {
    logEvent("error", "spaces.fetch_failed", describeError(err));
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
    const raw = await request.json();
    body = createSpaceSchema.parse(raw);
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
    // Check if space with same name already exists
    const { data: existing } = await admin
      .from("spaces")
      .select("id, name")
      .eq("community_id", session.activeCommunityId)
      .ilike("name", body.name)
      .maybeSingle();

    if (existing) {
      return json({ error: "already_exists", space: existing }, 409);
    }

    const { data: created, error: insertErr } = await admin
      .from("spaces")
      .insert({
        community_id: session.activeCommunityId,
        name: body.name,
      })
      .select("id, name, created_at")
      .single();

    if (insertErr) throw insertErr;

    return json({ success: true, space: created }, 201);
  } catch (err) {
    logEvent("error", "spaces.create_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
