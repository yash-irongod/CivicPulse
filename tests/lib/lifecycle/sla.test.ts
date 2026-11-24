import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  DEFAULT_SLA_HOURS,
  assignIncidentSla,
  calculateTargetDate,
  hoursRemaining,
  isOverdue,
} from "../../../lib/lifecycle/sla";

describe("SLA policy engine", () => {
  describe("hoursRemaining", () => {
    it("returns positive hours for a future target", () => {
      const future = new Date(Date.now() + 5 * 3600 * 1000).toISOString();
      const remaining = hoursRemaining({ sla_target_at: future });
      expect(remaining).toBeCloseTo(5, 0);
    });

    it("returns negative hours for a breached/past target", () => {
      const past = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
      const remaining = hoursRemaining({ slaTargetAt: past });
      expect(remaining).toBeCloseTo(-3, 0);
      expect(isOverdue({ slaTargetAt: past })).toBe(true);
    });

    it("returns null when no target is present", () => {
      expect(hoursRemaining({})).toBeNull();
      expect(hoursRemaining({ sla_target_at: null })).toBeNull();
      expect(isOverdue({})).toBe(false);
    });
  });

  describe("calculateTargetDate", () => {
    it("adds target hours to base date", () => {
      const base = new Date("2026-01-01T00:00:00.000Z");
      const target = calculateTargetDate(24, base);
      expect(target.toISOString()).toBe("2026-01-02T00:00:00.000Z");
    });
  });

  describe("assignIncidentSla", () => {
    it("uses community policy when available", async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { target_hours: 12 },
        error: null,
      });
      const eqSeverity = vi.fn().mockReturnValue({ maybeSingle });
      const eqCategory = vi.fn().mockReturnValue({ eq: eqSeverity });
      const eqCommunity = vi.fn().mockReturnValue({ eq: eqCategory });
      const select = vi.fn().mockReturnValue({ eq: eqCommunity });

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "sla_policies") return { select };
        if (table === "incidents") return { update };
        return {};
      });

      const client = { from } as unknown as SupabaseClient;

      const result = await assignIncidentSla(
        client,
        "inc-1",
        "comm-1",
        "cat-1",
        "high",
      );

      expect(result).toBeInstanceOf(Date);
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ sla_target_at: expect.any(String) }),
      );
    });

    it("falls back to default hours when no specific policy exists", async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const maybeSingle = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }),
      });

      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "sla_policies") return { select };
        if (table === "incidents") return { update };
        return {};
      });

      const client = { from } as unknown as SupabaseClient;

      const before = Date.now();
      const result = await assignIncidentSla(
        client,
        "inc-1",
        "comm-1",
        "cat-1",
        "critical",
      );

      expect(result).toBeInstanceOf(Date);
      const expectedHours = DEFAULT_SLA_HOURS.critical; // 4h
      const diffHours = (result!.getTime() - before) / (3600 * 1000);
      expect(diffHours).toBeCloseTo(expectedHours, 0);
    });

    it("computes SLA target relative to custom baseDate when provided", async () => {
      const update = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });
      const maybeSingle = vi.fn().mockResolvedValue({
        data: { target_hours: 4 },
        error: null,
      });
      const select = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle }),
          }),
        }),
      });
      const from = vi.fn().mockImplementation((table: string) => {
        if (table === "sla_policies") return { select };
        if (table === "incidents") return { update };
        return {};
      });

      const createdAt = new Date("2026-01-01T10:00:00.000Z");
      const result = await assignIncidentSla(
        { from } as unknown as SupabaseClient,
        "inc-2",
        "comm-1",
        "cat-1",
        "critical",
        createdAt,
      );

      expect(result?.toISOString()).toBe("2026-01-01T14:00:00.000Z");
    });
  });
});
