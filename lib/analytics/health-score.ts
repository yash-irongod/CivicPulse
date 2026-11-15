// Community Health Score (Task 7.2, §7.2, §9.1).
// Versioned formula producing a transparent 0-100 score + full component breakdown.
// Never just an opaque black-box number (§7.2).

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";

export const HEALTH_SCORE_VERSION = 1;

export interface RawHealthMetrics {
  totalTrailing30: number;
  resolvedTrailing30: number;
  openCount: number;
  criticalOverdueCount: number;
  slaCompliantCount: number;
  slaEvaluatedCount: number;
  avgBacklogAgeDays: number;
}

export interface HealthScoreBreakdown {
  resolutionRateScore: number; // 0 - 35
  slaComplianceScore: number; // 0 - 30
  overdueSafetyScore: number; // 0 - 20
  backlogVelocityScore: number; // 0 - 15
  rawMetrics: RawHealthMetrics;
}

export interface CommunityHealthScore {
  version: number;
  overallScore: number; // 0 - 100 integer
  breakdown: HealthScoreBreakdown;
  computedAt: string;
}

/**
 * Pure formula calculation (unit-testable with no DB).
 */
export function computeHealthScore(
  metrics: RawHealthMetrics,
): CommunityHealthScore {
  // 1. Resolution rate (weight: 35 points)
  let resolutionRate = 1.0;
  if (metrics.totalTrailing30 > 0) {
    resolutionRate = metrics.resolvedTrailing30 / metrics.totalTrailing30;
  }
  const resolutionRateScore = Math.round(resolutionRate * 35);

  // 2. SLA Compliance rate (weight: 30 points)
  let slaComplianceRate = 1.0;
  if (metrics.slaEvaluatedCount > 0) {
    slaComplianceRate = metrics.slaCompliantCount / metrics.slaEvaluatedCount;
  }
  const slaComplianceScore = Math.round(slaComplianceRate * 30);

  // 3. Overdue Safety score (weight: 20 points, deducts 10 points per critical overdue)
  const overduePenalty = metrics.criticalOverdueCount * 10;
  const overdueSafetyScore = Math.max(0, 20 - overduePenalty);

  // 4. Backlog Velocity score (weight: 15 points, decays with backlog age > 7 days)
  let backlogVelocityScore = 15;
  if (metrics.avgBacklogAgeDays > 14) {
    backlogVelocityScore = Math.max(
      0,
      15 - Math.round((metrics.avgBacklogAgeDays - 14) * 0.5),
    );
  }

  const overallScore = Math.min(
    100,
    Math.max(
      0,
      resolutionRateScore +
        slaComplianceScore +
        overdueSafetyScore +
        backlogVelocityScore,
    ),
  );

  return {
    version: HEALTH_SCORE_VERSION,
    overallScore,
    breakdown: {
      resolutionRateScore,
      slaComplianceScore,
      overdueSafetyScore,
      backlogVelocityScore,
      rawMetrics: metrics,
    },
    computedAt: new Date().toISOString(),
  };
}

/**
 * Query DB and compute health score for a community.
 */
export async function getCommunityHealthScore(
  client: SupabaseClient,
  communityId: string,
): Promise<CommunityHealthScore> {
  const thirtyDaysAgo = new Date(
    Date.now() - 30 * 24 * 3600 * 1000,
  ).toISOString();
  const nowTime = Date.now();

  try {
    // 1. Fetch trailing 30-day incidents
    const { data: trailingIncidents } = await client
      .from("incidents")
      .select("id, status, severity, created_at, resolved_at, sla_target_at")
      .eq("community_id", communityId)
      .gte("created_at", thirtyDaysAgo);

    const incidents = trailingIncidents ?? [];
    const totalTrailing30 = incidents.length;
    let resolvedTrailing30 = 0;
    let openCount = 0;
    let criticalOverdueCount = 0;
    let slaCompliantCount = 0;
    let slaEvaluatedCount = 0;
    let totalBacklogAgeDays = 0;

    for (const inc of incidents) {
      const isResolved =
        inc.status === "resolved" ||
        inc.status === "resident_feedback" ||
        inc.status === "closed";

      if (isResolved) {
        resolvedTrailing30++;
      } else {
        openCount++;
        const createdAtTime = new Date(inc.created_at).getTime();
        const ageDays = (nowTime - createdAtTime) / (1000 * 3600 * 24);
        totalBacklogAgeDays += ageDays;

        if (inc.severity === "critical" && inc.sla_target_at) {
          const targetTime = new Date(inc.sla_target_at).getTime();
          if (targetTime < nowTime) {
            criticalOverdueCount++;
          }
        }
      }

      if (inc.sla_target_at) {
        slaEvaluatedCount++;
        const targetTime = new Date(inc.sla_target_at).getTime();
        const resolvedTime = inc.resolved_at
          ? new Date(inc.resolved_at).getTime()
          : nowTime;
        if (resolvedTime <= targetTime) {
          slaCompliantCount++;
        }
      }
    }

    const avgBacklogAgeDays =
      openCount > 0
        ? Math.round((totalBacklogAgeDays / openCount) * 10) / 10
        : 0;

    return computeHealthScore({
      totalTrailing30,
      resolvedTrailing30,
      openCount,
      criticalOverdueCount,
      slaCompliantCount,
      slaEvaluatedCount,
      avgBacklogAgeDays,
    });
  } catch (err) {
    logEvent("error", "health_score.query_failed", describeError(err));
    // Default safe fallback
    return computeHealthScore({
      totalTrailing30: 0,
      resolvedTrailing30: 0,
      openCount: 0,
      criticalOverdueCount: 0,
      slaCompliantCount: 0,
      slaEvaluatedCount: 0,
      avgBacklogAgeDays: 0,
    });
  }
}
