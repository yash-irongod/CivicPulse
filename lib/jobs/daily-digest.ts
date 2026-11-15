// Daily Digest Generator (Task 6.2, §7.6, §9.1).
// Computes daily community health summaries and delivers digest updates to committee admins.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import { notify } from "../notify/service";

export interface DailyDigestResult {
  communitiesProcessed: number;
  adminsAlerted: number;
}

export async function runDailyDigest(
  adminClient: SupabaseClient,
): Promise<DailyDigestResult> {
  const result: DailyDigestResult = {
    communitiesProcessed: 0,
    adminsAlerted: 0,
  };

  try {
    // 1. Fetch all communities
    const { data: communities, error: commError } = await adminClient
      .from("communities")
      .select("id, name");

    if (commError || !communities) {
      logEvent(
        "error",
        "daily_digest.communities_failed",
        describeError(commError),
      );
      return result;
    }

    const now = new Date();
    const startOfToday = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    ).toISOString();

    for (const community of communities) {
      try {
        // Fetch incidents metrics for this community
        const { data: openIncidents } = await adminClient
          .from("incidents")
          .select("id, severity, sla_target_at, status")
          .eq("community_id", community.id)
          .not("status", "in", '("resolved","resident_feedback","closed")');

        const { count: resolvedTodayCount } = await adminClient
          .from("incidents")
          .select("id", { count: "exact", head: true })
          .eq("community_id", community.id)
          .gte("resolved_at", startOfToday);

        const openCount = openIncidents?.length ?? 0;
        let criticalCount = 0;
        let overdueCount = 0;

        const nowTime = now.getTime();
        for (const inc of openIncidents ?? []) {
          if (inc.severity === "critical") criticalCount++;
          if (inc.sla_target_at) {
            const targetTime = new Date(inc.sla_target_at).getTime();
            if (targetTime < nowTime) overdueCount++;
          }
        }

        // Fetch committee admins for this community
        const { data: adminMembers } = await adminClient
          .from("memberships")
          .select("resident_id")
          .eq("community_id", community.id)
          .eq("role", "committee_admin")
          .eq("status", "active");

        if (adminMembers && adminMembers.length > 0) {
          for (const m of adminMembers) {
            await notify(adminClient, m.resident_id, "daily_digest", {
              openCount,
              criticalCount,
              overdueCount,
              resolvedTodayCount: resolvedTodayCount ?? 0,
            });
            result.adminsAlerted++;
          }
        }

        result.communitiesProcessed++;
      } catch (err) {
        logEvent("error", "daily_digest.community_failed", {
          communityId: community.id,
          ...describeError(err),
        });
      }
    }
  } catch (err) {
    logEvent("error", "daily_digest.run_failed", describeError(err));
  }

  return result;
}
