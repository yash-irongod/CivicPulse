import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { runDailyDigest } from "../../../lib/jobs/daily-digest";
import { runSlaScanner } from "../../../lib/jobs/sla-scanner";
import { runStorageCleanup } from "../../../lib/jobs/storage-cleanup";
import * as notifyService from "../../../lib/notify/service";

describe("scheduled jobs", () => {
  describe("runSlaScanner", () => {
    it("scans open incidents nearing SLA and alerts admins once", async () => {
      const notifySpy = vi.spyOn(notifyService, "notify").mockResolvedValue({
        inAppCreated: true,
        pushDelivered: false,
        emailDelivered: false,
      });

      const insert = vi.fn().mockResolvedValue({ error: null });

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "incidents") {
          return {
            select: vi.fn().mockReturnValue({
              not: vi.fn().mockReturnValue({
                lte: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: "inc-overdue-1",
                        community_id: "comm-1",
                        severity: "critical",
                        sla_target_at: new Date(
                          Date.now() + 3600 * 1000,
                        ).toISOString(),
                      },
                    ],
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }

        if (table === "sla_breach_alerts") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [] }),
            }),
            insert,
          };
        }

        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ resident_id: "admin-1" }],
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      });

      const client = { from } as unknown as SupabaseClient;

      const result = await runSlaScanner(client, 2);
      expect(result.scanned).toBe(1);
      expect(result.alerted).toBe(1);
      expect(notifySpy).toHaveBeenCalledWith(
        client,
        "admin-1",
        "sla_breach_imminent",
        expect.objectContaining({ incidentId: "inc-overdue-1" }),
      );
      expect(insert).toHaveBeenCalledWith({ incident_id: "inc-overdue-1" });
    });
  });

  describe("runDailyDigest", () => {
    it("computes stats and delivers daily digest to community admins", async () => {
      const notifySpy = vi.spyOn(notifyService, "notify").mockResolvedValue({
        inAppCreated: true,
        pushDelivered: false,
        emailDelivered: false,
      });

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "communities") {
          return {
            select: vi.fn().mockResolvedValue({
              data: [{ id: "comm-1", name: "Green Park Society" }],
              error: null,
            }),
          };
        }

        if (table === "incidents") {
          return {
            select: vi.fn().mockImplementation((_cols, opts) => {
              if (opts?.head) {
                return {
                  eq: vi.fn().mockReturnValue({
                    gte: vi.fn().mockResolvedValue({ count: 4, error: null }),
                  }),
                };
              }
              return {
                eq: vi.fn().mockReturnValue({
                  not: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: "i-1",
                        severity: "critical",
                        sla_target_at: null,
                        status: "reported",
                      },
                      {
                        id: "i-2",
                        severity: "medium",
                        sla_target_at: "2026-01-01T00:00:00Z",
                        status: "assigned",
                      },
                    ],
                  }),
                }),
              };
            }),
          };
        }

        if (table === "memberships") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ resident_id: "admin-1" }],
                  }),
                }),
              }),
            }),
          };
        }

        return {};
      });

      const client = { from } as unknown as SupabaseClient;

      const result = await runDailyDigest(client);
      expect(result.communitiesProcessed).toBe(1);
      expect(result.adminsAlerted).toBe(1);
      expect(notifySpy).toHaveBeenCalledWith(
        client,
        "admin-1",
        "daily_digest",
        expect.objectContaining({
          openCount: 2,
          criticalCount: 1,
          overdueCount: 1,
          resolvedTodayCount: 4,
        }),
      );
    });
  });

  describe("runStorageCleanup", () => {
    it("returns zero when no old closed incidents exist", async () => {
      const from = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lt: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      });

      const client = { from } as unknown as SupabaseClient;
      const res = await runStorageCleanup(client, 90);
      expect(res.scannedIncidents).toBe(0);
      expect(res.cleanedPhotosCount).toBe(0);
    });

    it("cleans up photos for incidents closed older than retention days", async () => {
      const remove = vi.fn().mockResolvedValue({ data: [], error: null });
      const update = vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue({ error: null }),
      });

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "incidents") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                lt: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "inc-old-1",
                      community_id: "c-1",
                      closed_at: "2025-01-01T00:00:00Z",
                      resolution_before_photo: "c-1/inc-1/before.jpg",
                      resolution_after_photo: "c-1/inc-1/after.jpg",
                    },
                  ],
                  error: null,
                }),
              }),
            }),
            update,
          };
        }
        if (table === "incident_issues") {
          return {
            select: vi.fn().mockReturnValue({
              in: vi.fn().mockResolvedValue({ data: [] }),
            }),
          };
        }
        return {};
      });

      const storage = {
        from: vi.fn().mockReturnValue({ remove }),
      };

      const client = { from, storage } as unknown as SupabaseClient;
      const res = await runStorageCleanup(client, 90);

      expect(res.scannedIncidents).toBe(1);
      expect(res.cleanedPhotosCount).toBe(2);
      expect(remove).toHaveBeenCalledWith([
        "c-1/inc-1/before.jpg",
        "c-1/inc-1/after.jpg",
      ]);
    });
  });
});
