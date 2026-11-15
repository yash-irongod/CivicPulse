// Duplicate Detection Engine (Task 5.2, §6.6, §10).
// Combines hard spatial/temporal/category filtering with pgvector semantic similarity.
// Applies a 3-way split: auto-merge (high), flag for confirmation (borderline), new incident (low).

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import { callEmbedding } from "./provider";

export const DEFAULT_DEDUP_RADIUS_METERS = 500;
export const DEFAULT_DEDUP_WINDOW_HOURS = 72;
export const DEFAULT_HIGH_THRESHOLD = 0.85; // Auto-merge
export const DEFAULT_LOW_THRESHOLD = 0.6; // Flag as possible duplicate

export interface DedupOptions {
  radiusMeters?: number;
  timeWindowHours?: number;
  highThreshold?: number;
  lowThreshold?: number;
}

export interface CandidateIncidentRow {
  id: string;
  canonical_description: string | null;
  description_embedding: number[] | string | null;
  category_id: string;
  severity: string | null;
  status: string;
  distance_meters: number;
  created_at: string;
}

export type DedupDecision =
  | {
      action: "auto_merge";
      targetIncidentId: string;
      score: number;
      reason: string;
    }
  | {
      action: "flag_duplicate";
      possibleDuplicateOf: string;
      score: number;
      reason: string;
    }
  | {
      action: "create_new";
      score?: number;
      reason: string;
    };

/**
 * Computes cosine similarity between two numeric vectors.
 * Returns value in range [-1, 1].
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    const valA = a[i]!;
    const valB = b[i]!;
    dotProduct += valA * valB;
    normA += valA * valA;
    normB += valB * valB;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Combines semantic, geospatial, and temporal decay into a single score [0, 1].
 * §6.6: semantic + geo + temporal.
 */
export function computeCombinedDedupScore(params: {
  semanticSimilarity: number | null;
  distanceMeters: number;
  radiusMeters: number;
  ageHours: number;
  windowHours: number;
}): number {
  const geoDecay = Math.max(
    0,
    Math.min(1, 1 - params.distanceMeters / params.radiusMeters),
  );
  const timeDecay = Math.max(
    0,
    Math.min(1, 1 - params.ageHours / params.windowHours),
  );

  if (params.semanticSimilarity !== null) {
    // Clamp cosine similarity from [-1, 1] to [0, 1]
    const semanticNormalized = Math.max(
      0,
      Math.min(1, (params.semanticSimilarity + 1) / 2),
    );
    return 0.5 * semanticNormalized + 0.35 * geoDecay + 0.15 * timeDecay;
  }

  // Fallback when embedding is unavailable on either side
  return 0.7 * geoDecay + 0.3 * timeDecay;
}

export function parseEmbedding(raw: unknown): number[] | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try {
      // Postgres vector returns format "[0.123, 0.456, ...]"
      const cleaned = raw.replace(/^\[/, "").replace(/\]$/, "");
      return cleaned.split(",").map((s) => Number.parseFloat(s.trim()));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Main deduplication engine evaluation for a new issue.
 */
export async function evaluateDuplicate(
  client: SupabaseClient,
  issue: {
    id: string;
    communityId: string;
    categoryId: string | null;
    geo: string;
    text: string | null;
    embedding?: number[] | null;
  },
  options: DedupOptions = {},
): Promise<DedupDecision> {
  const radius = options.radiusMeters ?? DEFAULT_DEDUP_RADIUS_METERS;
  const windowHours = options.timeWindowHours ?? DEFAULT_DEDUP_WINDOW_HOURS;
  const highThreshold = options.highThreshold ?? DEFAULT_HIGH_THRESHOLD;
  const lowThreshold = options.lowThreshold ?? DEFAULT_LOW_THRESHOLD;

  if (!issue.categoryId) {
    return {
      action: "create_new",
      reason: "Issue is unclassified; cannot hard-filter by category.",
    };
  }

  // 1. Fetch candidates from DB via candidate_incidents_for_dedup (0005)
  let candidateRows: CandidateIncidentRow[] = [];
  try {
    const { data, error } = await client.rpc("candidate_incidents_for_dedup", {
      new_geo: issue.geo,
      new_category_id: issue.categoryId,
      community_id: issue.communityId,
      radius_meters: radius,
      time_window_hours: windowHours,
    });

    if (error) throw error;
    if (data && Array.isArray(data)) {
      candidateRows = data as CandidateIncidentRow[];
    }
  } catch (error) {
    logEvent("error", "dedupe.candidate_lookup_failed", describeError(error));
    return {
      action: "create_new",
      reason: "Candidate lookup failed; falling back to new incident.",
    };
  }

  if (candidateRows.length === 0) {
    return {
      action: "create_new",
      reason:
        "No candidate incidents in matching category, radius, or time window.",
    };
  }

  // 2. Obtain embedding for the new issue if text is present
  let issueEmbedding = issue.embedding ?? null;
  if (!issueEmbedding && issue.text && issue.text.trim().length > 0) {
    try {
      issueEmbedding = await callEmbedding("dedup-embed", { text: issue.text });
    } catch (err) {
      logEvent("warn", "dedupe.embedding_failed", describeError(err));
    }
  }

  // 3. Score each candidate
  let topCandidate: {
    id: string;
    score: number;
  } | null = null;

  const now = Date.now();

  for (const candidate of candidateRows) {
    const candidateEmbedding = parseEmbedding(candidate.description_embedding);
    let semanticSim: number | null = null;

    if (issueEmbedding && candidateEmbedding) {
      semanticSim = cosineSimilarity(issueEmbedding, candidateEmbedding);
    }

    const createdAtTime = new Date(candidate.created_at).getTime();
    const ageHours = Math.max(0, (now - createdAtTime) / (1000 * 60 * 60));

    const combinedScore = computeCombinedDedupScore({
      semanticSimilarity: semanticSim,
      distanceMeters: candidate.distance_meters,
      radiusMeters: radius,
      ageHours,
      windowHours,
    });

    if (!topCandidate || combinedScore > topCandidate.score) {
      topCandidate = {
        id: candidate.id,
        score: Math.round(combinedScore * 1000) / 1000,
      };
    }
  }

  if (!topCandidate) {
    return { action: "create_new", reason: "No scored candidates." };
  }

  // 4. Threshold 3-way split (§6.6)
  if (topCandidate.score >= highThreshold) {
    return {
      action: "auto_merge",
      targetIncidentId: topCandidate.id,
      score: topCandidate.score,
      reason: `High confidence match (score: ${topCandidate.score} >= ${highThreshold}).`,
    };
  }

  if (topCandidate.score >= lowThreshold) {
    return {
      action: "flag_duplicate",
      possibleDuplicateOf: topCandidate.id,
      score: topCandidate.score,
      reason: `Borderline match (score: ${topCandidate.score} in [${lowThreshold}, ${highThreshold})). Flagged for admin review.`,
    };
  }

  return {
    action: "create_new",
    score: topCandidate.score,
    reason: `Low match score (${topCandidate.score} < ${lowThreshold}).`,
  };
}
