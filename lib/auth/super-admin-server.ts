// Server-only cookie helpers for Founder Super Admin session verification.

import "server-only";

import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  SUPER_ADMIN_COOKIE_NAME,
  isSuperAdminSecretValidConfig,
  verifySuperAdminToken,
} from "./super-admin";

export function isSuperAdminConfigured(): boolean {
  return isSuperAdminSecretValidConfig(process.env.SUPER_ADMIN_SECRET);
}

export async function isSuperAdminAuthenticated(): Promise<boolean> {
  const secret = process.env.SUPER_ADMIN_SECRET;
  if (!isSuperAdminSecretValidConfig(secret)) return false;

  const cookieStore = await cookies();
  const token = cookieStore.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  return verifySuperAdminToken(token, secret);
}

export function superAdminUnauthorizedResponse(): NextResponse {
  const response = NextResponse.json(
    { error: "super_admin_unauthorized" },
    { status: 401 },
  );
  response.headers.set("Cache-Control", "no-store");
  return response;
}
