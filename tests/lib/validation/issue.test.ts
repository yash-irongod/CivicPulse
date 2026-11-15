import { describe, expect, it } from "vitest";

import {
  geoSchema,
  issueSubmissionInputSchema,
} from "../../../lib/validation/issue";

describe("issue validation schemas", () => {
  describe("geoSchema", () => {
    it("accepts valid coordinates", () => {
      const parsed = geoSchema.safeParse({
        latitude: 28.6139,
        longitude: 77.209,
      });
      expect(parsed.success).toBe(true);
    });

    it("rejects latitude out of bounds", () => {
      expect(
        geoSchema.safeParse({ latitude: 95, longitude: 77.2 }).success,
      ).toBe(false);
      expect(
        geoSchema.safeParse({ latitude: -91, longitude: 77.2 }).success,
      ).toBe(false);
    });

    it("rejects longitude out of bounds", () => {
      expect(
        geoSchema.safeParse({ latitude: 28.6, longitude: 185 }).success,
      ).toBe(false);
      expect(
        geoSchema.safeParse({ latitude: 28.6, longitude: -185 }).success,
      ).toBe(false);
    });
  });

  describe("issueSubmissionInputSchema", () => {
    it("accepts valid input with text and coordinates", () => {
      const parsed = issueSubmissionInputSchema.safeParse({
        text: "Pothole near gate 2",
        latitude: "28.6139",
        longitude: "77.2090",
      });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.text).toBe("Pothole near gate 2");
        expect(parsed.data.latitude).toBe(28.6139);
        expect(parsed.data.longitude).toBe(77.209);
      }
    });

    it("accepts input without text (for photo/voice only)", () => {
      const parsed = issueSubmissionInputSchema.safeParse({
        latitude: 28.6139,
        longitude: 77.209,
      });
      expect(parsed.success).toBe(true);
    });
  });
});
