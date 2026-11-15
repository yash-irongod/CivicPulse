import { describe, expect, it } from "vitest";

import {
  consolidateRpcResultSchema,
  mergeRequestSchema,
  mergeRpcResultSchema,
  openIncidentCandidatesSchema,
  searchQuerySchema,
} from "../../../lib/validation/consolidate";

const VALID_UUID = "00000000-0000-0000-0000-00000000c001";
const TARGET_UUID = "00000000-0000-0000-0000-00000000c002";

describe("consolidate validation schemas", () => {
  describe("consolidateRpcResultSchema", () => {
    it("accepts valid RPC result rows", () => {
      const data = [{ out_incident_id: VALID_UUID, out_created: true }];
      const parsed = consolidateRpcResultSchema.safeParse(data);
      expect(parsed.success).toBe(true);
    });

    it("rejects invalid UUIDs in RPC result", () => {
      const data = [{ out_incident_id: "not-a-uuid", out_created: true }];
      expect(consolidateRpcResultSchema.safeParse(data).success).toBe(false);
    });
  });

  describe("openIncidentCandidatesSchema", () => {
    it("accepts valid candidate incident rows", () => {
      const data = [
        {
          id: VALID_UUID,
          canonical_description: "Water leakage",
          category_id: null,
          severity: "high",
          status: "reported",
          distance_meters: 42.5,
          created_at: "2026-01-01T00:00:00Z",
        },
      ];
      expect(openIncidentCandidatesSchema.safeParse(data).success).toBe(true);
    });
  });

  describe("mergeRpcResultSchema", () => {
    it("accepts single-row merge result", () => {
      const data = [
        {
          out_previous_incident_id: VALID_UUID,
          out_target_incident_id: TARGET_UUID,
        },
      ];
      expect(mergeRpcResultSchema.safeParse(data).success).toBe(true);
    });

    it("rejects multiple rows", () => {
      const data = [
        {
          out_previous_incident_id: VALID_UUID,
          out_target_incident_id: TARGET_UUID,
        },
        {
          out_previous_incident_id: VALID_UUID,
          out_target_incident_id: TARGET_UUID,
        },
      ];
      expect(mergeRpcResultSchema.safeParse(data).success).toBe(false);
    });
  });

  describe("mergeRequestSchema", () => {
    it("accepts valid merge request", () => {
      expect(
        mergeRequestSchema.safeParse({ targetIncidentId: TARGET_UUID }).success,
      ).toBe(true);
    });

    it("rejects missing or malformed targetIncidentId", () => {
      expect(mergeRequestSchema.safeParse({}).success).toBe(false);
      expect(
        mergeRequestSchema.safeParse({ targetIncidentId: "invalid" }).success,
      ).toBe(false);
    });
  });

  describe("searchQuerySchema", () => {
    it("uses default values when query params are omitted", () => {
      const parsed = searchQuerySchema.safeParse({});
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.radiusMeters).toBe(500);
        expect(parsed.data.windowHours).toBe(72);
      }
    });

    it("coerces string numbers correctly", () => {
      const parsed = searchQuerySchema.safeParse({
        radiusMeters: "1000",
        windowHours: "48",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.radiusMeters).toBe(1000);
        expect(parsed.data.windowHours).toBe(48);
      }
    });

    it("rejects non-positive numbers", () => {
      expect(searchQuerySchema.safeParse({ radiusMeters: -5 }).success).toBe(
        false,
      );
      expect(searchQuerySchema.safeParse({ windowHours: 0 }).success).toBe(
        false,
      );
    });
  });
});
