// GET, PUT, DELETE /api/account/email — Optional backup alert email setting inside app.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  buildFallbackSyntheticEmail,
  extractPublicEmail,
} from "@/lib/auth/account-email";
import {
  UnauthorizedError,
  requireSession,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { checkRateLimit, type LimitSpec } from "@/lib/auth/rate-limit";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import { emailSchema } from "@/lib/validation/claim";

export const dynamic = "force-dynamic";

const EMAIL_UPDATE_LIMIT: LimitSpec = {
  bucket: "account_email_update",
  limit: 5,
  windowSeconds: 3600,
};

const updateEmailSchema = z.object({
  email: emailSchema,
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
    session = await requireSession(db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  const admin = createSupabaseServiceRoleClient();
  try {
    const { data, error } = await admin.auth.admin.getUserById(
      session.resident.authUserId,
    );
    if (error) throw error;

    return json({ email: extractPublicEmail(data.user?.email) }, 200);
  } catch (err) {
    logEvent("error", "account_email.get_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function PUT(request: NextRequest): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireSession(db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    body = updateEmailSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_email" }, 400);
  }

  const admin = createSupabaseServiceRoleClient();
  try {
    const limit = await checkRateLimit(
      admin,
      EMAIL_UPDATE_LIMIT,
      session.resident.id,
    );
    if (!limit.allowed) {
      return json(
        { error: "rate_limited", retryAfterSeconds: limit.retryAfterSeconds },
        429,
      );
    }

    const { error: updateErr } = await admin.auth.admin.updateUserById(
      session.resident.authUserId,
      {
        email: body.email,
        email_confirm: true,
      },
    );

    if (updateErr) {
      if (
        updateErr.code === "email_exists" ||
        updateErr.code === "user_already_exists"
      ) {
        return json({ error: "email_in_use" }, 409);
      }
      throw updateErr;
    }

    logEvent("info", "account_email.updated", {
      residentId: session.resident.id,
    });
    return json({ email: body.email }, 200);
  } catch (err) {
    logEvent("error", "account_email.update_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}

export async function DELETE(): Promise<Response> {
  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireSession(db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    return json({ error: "server_error" }, 500);
  }

  const admin = createSupabaseServiceRoleClient();
  try {
    const { data: rosterRow } = await admin
      .from("roster_entries")
      .select("id")
      .eq("resident_id", session.resident.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fallbackEmail = buildFallbackSyntheticEmail(
      session.resident.id,
      rosterRow?.id as string | undefined,
    );

    const { error: updateErr } = await admin.auth.admin.updateUserById(
      session.resident.authUserId,
      {
        email: fallbackEmail,
        email_confirm: true,
      },
    );

    if (updateErr) throw updateErr;

    logEvent("info", "account_email.removed", {
      residentId: session.resident.id,
    });
    return json({ email: null }, 200);
  } catch (err) {
    logEvent("error", "account_email.remove_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }
}
