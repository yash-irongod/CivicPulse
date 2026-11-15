// Team Workload & Performance Aggregation (Task 7.3).
// Pure aggregation query backing the "Electrical is handling 73% of active workload" view.
// No new tables required (§7.3).

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";

export interface TeamWorkloadStats {
  teamId: string;
  teamName: string;
  activeIncidentCount: number;
  overdueIncidentCount: number;
  resolvedIncidentCount: number;
  avgResolutionHours: number | null;
  workloadPercentage: number; // 0 - 100 percentage
}

export async function getTeamWorkloadStats(
  client: SupabaseClient,
  communityId: string,
  trailingDays: number = 30,
): Promise<TeamWorkloadStats[]> {
  const cutoff = new Date(
    Date.now() - trailingDays * 24 * 3600 * 1000,
  ).toISOString();
  const nowTime = Date.now();

  try {
    // 1. Fetch teams for this community
    const { data: teams, error: teamsError } = await client
      .from("teams")
      .select("id, name")
      .eq("community_id", communityId);

    if (teamsError || !teams || teams.length === 0) {
      return [];
    }

    // 2. Fetch incidents assigned to any team in this community
    const { data: incidents, error: incError } = await client
      .from("incidents")
      .select(
        "id, assigned_team_id, status, sla_target_at, created_at, resolved_at",
      )
      .eq("community_id", communityId)
      .not("assigned_team_id", "is", null)
      .gte("created_at", cutoff);

    if (incError) throw incError;

    // 3. Aggregate per team
    const teamMap = new Map<
      string,
      {
        activeCount: number;
        overdueCount: number;
        resolvedCount: number;
        totalResolutionHours: number;
      }
    >();

    for (const team of teams) {
      teamMap.set(team.id, {
        activeCount: 0,
        overdueCount: 0,
        resolvedCount: 0,
        totalResolutionHours: 0,
      });
    }

    let totalActiveAcrossAllTeams = 0;

    for (const inc of incidents ?? []) {
      if (!inc.assigned_team_id) continue;
      const stats = teamMap.get(inc.assigned_team_id);
      if (!stats) continue;

      const isResolved =
        inc.status === "resolved" ||
        inc.status === "resident_feedback" ||
        inc.status === "closed";

      if (isResolved) {
        stats.resolvedCount++;
        if (inc.resolved_at) {
          const createTime = new Date(inc.created_at).getTime();
          const resolveTime = new Date(inc.resolved_at).getTime();
          const diffHours = (resolveTime - createTime) / (1000 * 3600);
          stats.totalResolutionHours += Math.max(0, diffHours);
        }
      } else {
        stats.activeCount++;
        totalActiveAcrossAllTeams++;

        if (inc.sla_target_at) {
          const targetTime = new Date(inc.sla_target_at).getTime();
          if (targetTime < nowTime) {
            stats.overdueCount++;
          }
        }
      }
    }

    const result: TeamWorkloadStats[] = [];

    for (const team of teams) {
      const stats = teamMap.get(team.id)!;
      const avgResolutionHours =
        stats.resolvedCount > 0
          ? Math.round(
              (stats.totalResolutionHours / stats.resolvedCount) * 10,
            ) / 10
          : null;

      const workloadPercentage =
        totalActiveAcrossAllTeams > 0
          ? Math.round((stats.activeCount / totalActiveAcrossAllTeams) * 100)
          : 0;

      result.push({
        teamId: team.id,
        teamName: team.name,
        activeIncidentCount: stats.activeCount,
        overdueIncidentCount: stats.overdueCount,
        resolvedIncidentCount: stats.resolvedCount,
        avgResolutionHours,
        workloadPercentage,
      });
    }

    // Sort descending by workload
    result.sort((a, b) => b.activeIncidentCount - a.activeIncidentCount);

    return result;
  } catch (err) {
    logEvent("error", "analytics.team_workload_failed", describeError(err));
    return [];
  }
}
