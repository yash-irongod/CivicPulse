import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  UnauthorizedError,
  requireRole,
  requireSession,
  unauthorizedResponse,
} from "../../../lib/auth/guards";

function mockSupabase(
  user: { id: string } | null,
  resident: Record<string, unknown> | null,
  memberships: Array<Record<string, unknown>>,
) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user },
        error: null,
      }),
    },
    from: vi.fn().mockImplementation((table: string) => {
      if (table === "residents") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: resident,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === "memberships") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: memberships,
                error: null,
              }),
            }),
          }),
        };
      }
      return {};
    }),
  } as unknown as SupabaseClient;
}

describe("auth guards", () => {
  const resident = {
    id: "00000000-0000-0000-0000-0000000e0001",
    auth_user_id: "auth-user-1",
    display_name: "Test User",
    phone: null,
    preferred_language: "en",
  };

  it("throws unauthenticated when user is not signed in", async () => {
    const client = mockSupabase(null, null, []);
    await expect(requireSession(client)).rejects.toThrow(UnauthorizedError);
    await expect(
      requireRole(["committee_admin"], client),
    ).rejects.toMatchObject({
      code: "unauthenticated",
    });
  });

  it("throws forbidden when user lacks the required role", async () => {
    const memberships = [
      {
        id: "m-1",
        resident_id: resident.id,
        community_id: "c-1",
        space_id: null,
        role: "resident",
        status: "active",
      },
    ];
    const client = mockSupabase({ id: "auth-user-1" }, resident, memberships);

    await expect(
      requireRole(["committee_admin", "maintenance_staff"], client),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("returns session when user has the required role", async () => {
    const memberships = [
      {
        id: "m-1",
        resident_id: resident.id,
        community_id: "c-1",
        space_id: null,
        role: "committee_admin",
        status: "active",
      },
    ];
    const client = mockSupabase({ id: "auth-user-1" }, resident, memberships);

    const session = await requireRole(["committee_admin"], client);
    expect(session.resident.id).toBe(resident.id);
    expect(session.activeCommunityId).toBe("c-1");
  });

  it("unauthorizedResponse maps codes to appropriate HTTP status", async () => {
    const unauth = unauthorizedResponse(
      new UnauthorizedError("unauthenticated"),
    );
    expect(unauth.status).toBe(401);
    const body1 = await unauth.json();
    expect(body1).toEqual({ error: "unauthenticated" });

    const forbid = unauthorizedResponse(new UnauthorizedError("forbidden"));
    expect(forbid.status).toBe(403);
    const body2 = await forbid.json();
    expect(body2).toEqual({ error: "forbidden" });
  });
});
