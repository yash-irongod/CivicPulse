// Role and session guards for route handlers and server actions (Task 3.3).
// Every mutation endpoint checks role authorization through requireRole().

import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { Role, UserSession } from "./roles";
import { getSession } from "./session";

export type AuthErrorCode = "unauthenticated" | "forbidden";

export class UnauthorizedError extends Error {
  readonly code: AuthErrorCode;
  constructor(code: AuthErrorCode, message?: string) {
    super(message ?? code);
    this.name = "UnauthorizedError";
    this.code = code;
  }
}

export function unauthorizedResponse(error: UnauthorizedError): NextResponse {
  const status = error.code === "unauthenticated" ? 401 : 403;
  const res = NextResponse.json({ error: error.code }, { status });
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export async function requireSession(
  client: SupabaseClient,
): Promise<UserSession> {
  const session = await getSession(client);
  if (!session) {
    throw new UnauthorizedError("unauthenticated", "Authentication required");
  }
  return session;
}

export async function requireRole(
  allowedRoles: Role[],
  client: SupabaseClient,
): Promise<UserSession> {
  const session = await requireSession(client);
  const hasRole = session.memberships.some((m) =>
    allowedRoles.includes(m.role),
  );
  if (!hasRole) {
    throw new UnauthorizedError(
      "forbidden",
      `Requires one of roles: ${allowedRoles.join(", ")}`,
    );
  }
  return session;
}
