import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  dispatchTransitionNotifications,
  getCommunityAdmins,
  getIncidentReporters,
} from "../../../lib/notify/incident-notify";
import { notify } from "../../../lib/notify/service";
import { renderNotification } from "../../../lib/notify/templates";

describe("notifications", () => {
  describe("renderNotification templates", () => {
    it("renders incident_assigned in English and Hindi", () => {
      const en = renderNotification(
        "incident_assigned",
        { incidentId: "inc-1", teamName: "Plumbing" },
        "en",
      );
      expect(en.title).toBe("Incident assigned");
      expect(en.body).toContain("Plumbing");

      const hi = renderNotification(
        "incident_assigned",
        { incidentId: "inc-1", teamName: "Plumbing" },
        "hi",
      );
      expect(hi.title).toContain("शिकायत");
      expect(hi.body).toContain("Plumbing");
    });

    it("renders status_changed with localized status labels", () => {
      const en = renderNotification(
        "status_changed",
        {
          incidentId: "inc-1",
          fromStatus: "reported",
          toStatus: "in_progress",
        },
        "en",
      );
      expect(en.body).toContain("In progress");

      const hi = renderNotification(
        "status_changed",
        {
          incidentId: "inc-1",
          fromStatus: "reported",
          toStatus: "in_progress",
        },
        "hi",
      );
      expect(hi.body).toContain("कार्य प्रगति पर");
    });

    it("renders sla_breach_imminent with hours remaining", () => {
      const en = renderNotification(
        "sla_breach_imminent",
        { incidentId: "inc-1", hoursRemaining: 2.4, severity: "critical" },
        "en",
      );
      expect(en.title).toBe("SLA breach imminent");
      expect(en.body).toContain("2.4h");
    });

    it("renders resolved_confirmation", () => {
      const en = renderNotification(
        "resolved_confirmation",
        { incidentId: "inc-1" },
        "en",
      );
      expect(en.title).toBe("Confirm resolution");
      expect(en.body).toContain("Please confirm whether the issue was fixed");
    });
  });

  describe("notify service", () => {
    it("inserts notification into in-app inbox table", async () => {
      const insert = vi.fn().mockResolvedValue({ error: null });
      const select = vi.fn().mockImplementation(() => ({
        eq: vi.fn().mockImplementation(() => ({
          maybeSingle: vi.fn().mockResolvedValue({
            data: { preferred_language: "en", auth_user_id: "u1" },
          }),
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: { community_id: "comm-1" },
            }),
          }),
        })),
      }));

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "notifications") return { insert };
        if (table === "residents") return { select };
        if (table === "memberships") return { select };
        if (table === "push_subscriptions") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: [] }),
            }),
          };
        }
        return {};
      });

      const client = {
        from,
        auth: {
          admin: { getUserById: vi.fn().mockResolvedValue({ data: null }) },
        },
      } as unknown as SupabaseClient;

      const result = await notify(client, "res-1", "incident_assigned", {
        incidentId: "inc-1",
        teamName: "Electrical",
      });

      expect(result.inAppCreated).toBe(true);
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          community_id: "comm-1",
          resident_id: "res-1",
          type: "incident_assigned",
        }),
      );
    });
  });

  describe("incident-notify dispatcher", () => {
    it("finds incident reporters from linked issues", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({
              data: [
                { issue: { reporter_id: "reporter-1" } },
                { issue: { reporter_id: "reporter-2" } },
                { issue: { reporter_id: "reporter-1" } }, // Duplicate
              ],
              error: null,
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const reporters = await getIncidentReporters(mockClient, "inc-1");
      expect(reporters).toEqual(["reporter-1", "reporter-2"]);
    });

    it("finds community admins", async () => {
      const mockClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockResolvedValue({
                  data: [
                    { resident_id: "admin-1" },
                    { resident_id: "admin-2" },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        }),
      } as unknown as SupabaseClient;

      const admins = await getCommunityAdmins(mockClient, "comm-1");
      expect(admins).toEqual(["admin-1", "admin-2"]);
    });
  });
});
