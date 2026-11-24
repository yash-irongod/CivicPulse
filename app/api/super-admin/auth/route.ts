// GET, POST, DELETE /api/super-admin/auth — Founder console session management.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { describeError, logEvent } from "@/lib/auth/log";
import { enforceRateLimits, getClientIp } from "@/lib/auth/rate-limit";
import {
  SUPER_ADMIN_COOKIE_NAME,
  SUPER_ADMIN_SESSION_TTL_SECONDS,
  signSuperAdminToken,
  verifySuperAdminPassphrase,
} from "@/lib/auth/super-admin";
import {
  isSuperAdminAuthenticated,
  isSuperAdminConfigured,
} from "@/lib/auth/super-admin-server";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const loginSchema = z.object({
  passphrase: z.string().min(1).max(256),
});

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(): Promise<Response> {
  const configured = isSuperAdminConfigured();
  const authenticated = configured ? await isSuperAdminAuthenticated() : false;
  return json({ configured, authenticated }, 200);
}

export async function POST(request: NextRequest): Promise<Response> {
  if (!isSuperAdminConfigured()) {
    return json({ error: "super_admin_not_configured" }, 503);
  }

  try {
    const admin = createSupabaseServiceRoleClient();
    const limit = await enforceRateLimits(admin, [
      {
        spec: {
          bucket: "super_admin_login_ip",
          limit: 6,
          windowSeconds: 900, // 6 attempts per 15 minutes
        },
        identifier: getClientIp(request.headers),
      },
    ]);
    if (!limit.allowed) {
      const res = json(
        {
          error:
            limit.reason === "limit"
              ? "rate_limited"
              : "rate_limit_unavailable",
          retryAfterSeconds: limit.retryAfterSeconds,
        },
        limit.reason === "limit" ? 429 : 503,
      );
      res.headers.set("Retry-After", String(limit.retryAfterSeconds));
      return res;
    }
  } catch (err) {
    logEvent("error", "super_admin.rate_limit_error", describeError(err));
    return json({ error: "server_error" }, 500);
  }

  let body;
  try {
    body = loginSchema.parse(await request.json());
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const secret = process.env.SUPER_ADMIN_SECRET!;
  if (!verifySuperAdminPassphrase(body.passphrase, secret)) {
    logEvent("warn", "super_admin.login_failed", {
      ip: getClientIp(request.headers),
    });
    return json({ error: "invalid_passphrase" }, 401);
  }

  const token = signSuperAdminToken(secret);
  const response = json({ authenticated: true }, 200);
  response.cookies.set(SUPER_ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SUPER_ADMIN_SESSION_TTL_SECONDS,
  });
  logEvent("info", "super_admin.login_succeeded", {});
  return response;
}

export async function DELETE(): Promise<Response> {
  const response = json({ authenticated: false }, 200);
  response.cookies.set(SUPER_ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
