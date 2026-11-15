// Server-side layout auth guard.
// Used by route group layouts to verify the user has the required role
// before rendering the page. Redirects to appropriate pages if not.

import "server-only";

import { redirect } from "next/navigation";

import type { Role, UserSession } from "./roles";
import { getSession } from "./session";
import { createSupabaseServerClient } from "../supabase/server";

/**
 * Checks that the current user is authenticated and has at least one of
 * the allowed roles. Returns the session if so.
 *
 * If not authenticated: redirects to /auth/claim.
 * If authenticated but wrong role: redirects to /.
 *
 * This is for use in server component layouts/pages only.
 */
export async function requireLayoutRole(
  allowedRoles: Role[],
): Promise<UserSession> {
  const client = await createSupabaseServerClient();
  const session = await getSession(client);

  if (!session) {
    redirect("/auth/claim");
  }

  const hasRole = session.memberships.some((m) =>
    allowedRoles.includes(m.role),
  );

  if (!hasRole) {
    // Authenticated but doesn't have the required role — send home
    redirect("/");
  }

  return session;
}
