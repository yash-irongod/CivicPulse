import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  buildRosterDirectory,
  revokeRosterMember,
  updateRosterMemberRole,
} from "../../../lib/admin/roster-service";

const COMM_ID = "00000000-0000-0000-0000-00000000c001";
const ACTOR_RES_ID = "00000000-0000-0000-0000-00000000a001";
const TARGET_RES_ID = "00000000-0000-0000-0000-00000000a002";
const ENTRY_ID = "00000000-0000-0000-0000-00000000e001";
const TEAM_ID = "00000000-0000-0000-0000-00000000b001";

describe("Roster Directory & Governance Service", () => {
  it("merges claimed memberships, chief admin flags, and team assignments cleanly", () => {
    const entries = [
      {
        id: ENTRY_ID,
        community_id: COMM_ID,
        resident_id: TARGET_RES_ID,
        display_name: "Ramesh Plumber",
        phone: "9876543210",
        preferred_language: "hi",
        status: "claimed" as const,
        intended_role: "resident" as const,
        intended_team_id: null,
        is_chief_admin: false,
        claim_token_expires_at: null,
        claimed_at: "2026-10-01T00:00:00Z",
        created_at: "2026-10-01T00:00:00Z",
        space: { id: "sp-1", name: "Maintenance Gate" },
        team: null,
      },
      {
        id: "entry-pending-chief",
        community_id: COMM_ID,
        resident_id: null,
        display_name: "Secretary Sharma",
        phone: null,
        preferred_language: "en",
        status: "pending" as const,
        intended_role: "committee_admin" as const,
        intended_team_id: null,
        is_chief_admin: true,
        claim_token_expires_at: "2026-12-01T00:00:00Z",
        claimed_at: null,
        created_at: "2026-10-02T00:00:00Z",
        space: null,
        team: null,
      },
    ];

    const directory = buildRosterDirectory(
      entries,
      [
        {
          resident_id: TARGET_RES_ID,
          role: "maintenance_staff",
          status: "active",
          is_chief_admin: false,
        },
      ],
      [
        {
          resident_id: TARGET_RES_ID,
          team_id: TEAM_ID,
          teamName: "Plumbing Team",
        },
      ],
    );

    expect(directory[0]).toMatchObject({
      displayName: "Ramesh Plumber",
      role: "maintenance_staff",
      teamId: TEAM_ID,
      teamName: "Plumbing Team",
      isChiefAdmin: false,
      spaceName: "Maintenance Gate",
    });

    expect(directory[1]).toMatchObject({
      displayName: "Secretary Sharma",
      role: "committee_admin",
      isChiefAdmin: true,
      teamId: null,
      teamName: null,
    });
  });

  it("blocks revoking self and blocks revoking Chief Admin", async () => {
    const selfClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: ENTRY_ID,
                community_id: COMM_ID,
                resident_id: ACTOR_RES_ID,
                is_chief_admin: false,
              },
              error: null,
            }),
          }),
        }),
      }),
    } as unknown as SupabaseClient;

    await expect(
      revokeRosterMember(selfClient, {
        rosterEntryId: ENTRY_ID,
        communityId: COMM_ID,
        actorResidentId: ACTOR_RES_ID,
      }),
    ).resolves.toEqual({ kind: "forbidden", code: "cannot_revoke_self" });

    const chiefClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "roster_entries") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: ENTRY_ID,
                    community_id: COMM_ID,
                    resident_id: TARGET_RES_ID,
                    is_chief_admin: false,
                  },
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
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: "mem-chief" },
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    await expect(
      revokeRosterMember(chiefClient, {
        rosterEntryId: ENTRY_ID,
        communityId: COMM_ID,
        actorResidentId: ACTOR_RES_ID,
      }),
    ).resolves.toEqual({
      kind: "forbidden",
      code: "cannot_revoke_chief_admin",
    });
  });

  it("deactivates memberships and removes community team assignments on revoke", async () => {
    const rosterUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const membershipUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const teamMemberDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "roster_entries") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: ENTRY_ID,
                    community_id: COMM_ID,
                    resident_id: TARGET_RES_ID,
                    is_chief_admin: false,
                  },
                  error: null,
                }),
              }),
            }),
            update: rosterUpdate,
          };
        }
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: membershipUpdate,
          };
        }
        if (table === "teams") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: TEAM_ID }],
                error: null,
              }),
            }),
          };
        }
        if (table === "team_members") {
          return { delete: teamMemberDelete };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const result = await revokeRosterMember(client, {
      rosterEntryId: ENTRY_ID,
      communityId: COMM_ID,
      actorResidentId: ACTOR_RES_ID,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(rosterUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "revoked",
        allow_device_transfer: false,
      }),
    );
    expect(membershipUpdate).toHaveBeenCalledWith({
      status: "inactive",
      is_chief_admin: false,
    });
    expect(teamMemberDelete).toHaveBeenCalled();
  });

  it("updates claimed member to maintenance_staff and staffs them on target team", async () => {
    const rosterUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const memUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          neq: vi.fn().mockResolvedValue({ error: null }),
        }),
      }),
    });
    const memUpsert = vi.fn().mockResolvedValue({ error: null });
    const tmDelete = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      }),
    });
    const tmUpsert = vi.fn().mockResolvedValue({ error: null });

    const client = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "roster_entries") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: ENTRY_ID,
                    community_id: COMM_ID,
                    resident_id: TARGET_RES_ID,
                    space_id: null,
                    status: "claimed",
                    is_chief_admin: false,
                  },
                  error: null,
                }),
              }),
            }),
            update: rosterUpdate,
          };
        }
        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: null,
                        error: null,
                      }),
                    }),
                  }),
                }),
              }),
            }),
            update: memUpdate,
            upsert: memUpsert,
          };
        }
        if (table === "teams") {
          return {
            select: vi.fn().mockImplementation((cols: string) => {
              if (cols === "id") {
                return {
                  eq: vi.fn().mockImplementation(() => ({
                    eq: vi.fn().mockReturnValue({
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: TEAM_ID },
                        error: null,
                      }),
                    }),
                    then: (
                      resolve: (val: {
                        data: Array<{ id: string }>;
                        error: null;
                      }) => unknown,
                    ) => resolve({ data: [{ id: TEAM_ID }], error: null }),
                  })),
                };
              }
              return {};
            }),
          };
        }
        if (table === "team_members") {
          return { delete: tmDelete, upsert: tmUpsert };
        }
        return {};
      }),
    } as unknown as SupabaseClient;

    const result = await updateRosterMemberRole(client, {
      rosterEntryId: ENTRY_ID,
      communityId: COMM_ID,
      actorResidentId: ACTOR_RES_ID,
      role: "maintenance_staff",
      teamId: TEAM_ID,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(memUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        resident_id: TARGET_RES_ID,
        role: "maintenance_staff",
        status: "active",
      }),
      { onConflict: "resident_id,community_id,role" },
    );
    expect(tmUpsert).toHaveBeenCalledWith(
      { team_id: TEAM_ID, resident_id: TARGET_RES_ID },
      { onConflict: "team_id,resident_id" },
    );
  });
});
