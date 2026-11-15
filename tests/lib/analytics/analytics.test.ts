import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import { computeHealthScore } from "../../../lib/analytics/health-score";
import { getRecurrenceHotspots } from "../../../lib/analytics/recurrence";
import { getTeamWorkloadStats } from "../../../lib/analytics/team-performance";

describe("analytics and community intelligence", () => {
  describe("computeHealthScore", () => {
    it("returns high score for healthy community", () => {
      const result = computeHealthScore({
        totalTrailing30: 20,
        resolvedTrailing30: 19,
        openCount: 1,
        criticalOverdueCount: 0,
        slaCompliantCount: 19,
        slaEvaluatedCount: 20,
        avgBacklogAgeDays: 2,
      });

      expect(result.overallScore).toBeGreaterThanOrEqual(90);
      expect(result.version).toBe(1);
      expect(result.breakdown.overdueSafetyScore).toBe(20);
    });

    it("penalizes score heavily when critical incidents are overdue", () => {
      const result = computeHealthScore({
        totalTrailing30: 20,
        resolvedTrailing30: 10,
        openCount: 10,
        criticalOverdueCount: 3,
        slaCompliantCount: 8,
        slaEvaluatedCount: 15,
        avgBacklogAgeDays: 16,
      });

      expect(result.overallScore).toBeLessThan(60);
      expect(result.breakdown.overdueSafetyScore).toBe(0);
    });
  });

  describe("getRecurrenceHotspots", () => {
    it("identifies categories that exceed recurrence threshold", async () => {
      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "categories") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [{ id: "cat-drain", name: "Drainage" }],
              }),
            }),
          };
        }
        if (table === "spaces") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
          };
        }
        if (table === "incidents") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [
                      { id: "i1", category_id: "cat-drain" },
                      { id: "i2", category_id: "cat-drain" },
                      { id: "i3", category_id: "cat-drain" },
                      { id: "i4", category_id: "cat-drain" },
                    ],
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const client = { from } as unknown as SupabaseClient;

      const hotspots = await getRecurrenceHotspots(client, "comm-1", {
        minIncidents: 3,
      });

      expect(hotspots.length).toBe(1);
      expect(hotspots[0]?.categoryName).toBe("Drainage");
      expect(hotspots[0]?.incidentCount).toBe(4);
    });
  });

  describe("getTeamWorkloadStats", () => {
    it("aggregates active workload and calculates percentage", async () => {
      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "teams") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({
                data: [
                  { id: "team-elec", name: "Electrical" },
                  { id: "team-plumb", name: "Plumbing" },
                ],
              }),
            }),
          };
        }
        if (table === "incidents") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                not: vi.fn().mockReturnValue({
                  gte: vi.fn().mockResolvedValue({
                    data: [
                      {
                        id: "i1",
                        assigned_team_id: "team-elec",
                        status: "in_progress",
                        sla_target_at: null,
                        created_at: "2026-01-01T00:00:00Z",
                        resolved_at: null,
                      },
                      {
                        id: "i2",
                        assigned_team_id: "team-elec",
                        status: "in_progress",
                        sla_target_at: null,
                        created_at: "2026-01-01T00:00:00Z",
                        resolved_at: null,
                      },
                      {
                        id: "i3",
                        assigned_team_id: "team-plumb",
                        status: "in_progress",
                        sla_target_at: null,
                        created_at: "2026-01-01T00:00:00Z",
                        resolved_at: null,
                      },
                    ],
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const client = { from } as unknown as SupabaseClient;

      const stats = await getTeamWorkloadStats(client, "comm-1");
      expect(stats.length).toBe(2);

      const elec = stats.find((s) => s.teamName === "Electrical")!;
      expect(elec.activeIncidentCount).toBe(2);
      expect(elec.workloadPercentage).toBe(67); // 2 out of 3 = 67%

      const plumb = stats.find((s) => s.teamName === "Plumbing")!;
      expect(plumb.activeIncidentCount).toBe(1);
      expect(plumb.workloadPercentage).toBe(33); // 1 out of 3 = 33%
    });
  });
});
