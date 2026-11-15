import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  computeCombinedDedupScore,
  cosineSimilarity,
  evaluateDuplicate,
} from "../../../lib/ai/dedupe";

describe("duplicate detection engine", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("cosineSimilarity", () => {
    it("returns 1 for identical vectors", () => {
      const v = [0.5, 0.5, 0.5, 0.5];
      expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
    });

    it("returns 0 for orthogonal vectors", () => {
      const a = [1, 0];
      const b = [0, 1];
      expect(cosineSimilarity(a, b)).toBeCloseTo(0, 5);
    });

    it("returns -1 for opposite vectors", () => {
      const a = [1, 0];
      const b = [-1, 0];
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1, 5);
    });
  });

  describe("computeCombinedDedupScore", () => {
    it("computes high score for very close, recent, and semantically similar incident", () => {
      const score = computeCombinedDedupScore({
        semanticSimilarity: 0.98,
        distanceMeters: 5,
        radiusMeters: 500,
        ageHours: 1,
        windowHours: 72,
      });
      expect(score).toBeGreaterThan(0.9);
    });

    it("computes low score for distant or aged incident with weak similarity", () => {
      const score = computeCombinedDedupScore({
        semanticSimilarity: 0.1,
        distanceMeters: 450,
        radiusMeters: 500,
        ageHours: 70,
        windowHours: 72,
      });
      expect(score).toBeLessThan(0.4);
    });
  });

  describe("evaluateDuplicate 3-way split", () => {
    const issue = {
      id: "00000000-0000-0000-0000-0000000f0001",
      communityId: "00000000-0000-0000-0000-00000000c001",
      categoryId: "00000000-0000-0000-0000-000000009001",
      geo: "SRID=4326;POINT(77.2090 28.6139)",
      text: "Drain overflowing near Block C entrance",
      embedding: [0.9, 0.1, 0.0],
    };

    it("returns auto_merge when match score is above high threshold (>=0.85)", async () => {
      const candidates = [
        {
          id: "incident-candidate-1",
          canonical_description: "Block C drain overflow",
          description_embedding: [0.89, 0.11, 0.0],
          category_id: issue.categoryId,
          severity: "high",
          status: "reported",
          distance_meters: 10,
          created_at: new Date(Date.now() - 1 * 3600 * 1000).toISOString(),
        },
      ];

      const rpc = vi.fn().mockResolvedValue({ data: candidates, error: null });
      const client = { rpc } as unknown as SupabaseClient;

      const decision = await evaluateDuplicate(client, issue);
      expect(decision.action).toBe("auto_merge");
      if (decision.action === "auto_merge") {
        expect(decision.targetIncidentId).toBe("incident-candidate-1");
        expect(decision.score).toBeGreaterThanOrEqual(0.85);
      }
    });

    it("returns flag_duplicate when match score is borderline [0.60, 0.85)", async () => {
      const candidates = [
        {
          id: "incident-candidate-2",
          canonical_description: "Water pooling near gate",
          description_embedding: [0.5, 0.5, 0.0],
          category_id: issue.categoryId,
          severity: "medium",
          status: "reported",
          distance_meters: 150,
          created_at: new Date(Date.now() - 20 * 3600 * 1000).toISOString(),
        },
      ];

      const rpc = vi.fn().mockResolvedValue({ data: candidates, error: null });
      const client = { rpc } as unknown as SupabaseClient;

      const decision = await evaluateDuplicate(client, issue);
      expect(decision.action).toBe("flag_duplicate");
      if (decision.action === "flag_duplicate") {
        expect(decision.possibleDuplicateOf).toBe("incident-candidate-2");
        expect(decision.score).toBeGreaterThanOrEqual(0.6);
        expect(decision.score).toBeLessThan(0.85);
      }
    });

    it("returns create_new when match score is low (<0.60)", async () => {
      const candidates = [
        {
          id: "incident-candidate-3",
          canonical_description: "Distant manhole cover clattering",
          description_embedding: [0.0, 0.1, 0.9],
          category_id: issue.categoryId,
          severity: "low",
          status: "reported",
          distance_meters: 480,
          created_at: new Date(Date.now() - 65 * 3600 * 1000).toISOString(),
        },
      ];

      const rpc = vi.fn().mockResolvedValue({ data: candidates, error: null });
      const client = { rpc } as unknown as SupabaseClient;

      const decision = await evaluateDuplicate(client, issue);
      expect(decision.action).toBe("create_new");
      if (decision.action === "create_new" && decision.score !== undefined) {
        expect(decision.score).toBeLessThan(0.6);
      }
    });

    it("returns create_new when no candidate incidents exist", async () => {
      const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
      const client = { rpc } as unknown as SupabaseClient;

      const decision = await evaluateDuplicate(client, issue);
      expect(decision.action).toBe("create_new");
    });
  });
});
