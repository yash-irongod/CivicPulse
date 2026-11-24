// SLA Policy Engine (Task 5.3, §6.5).
// Calculates SLA targets for incidents on reaching `validated` and provides
// the unified hoursRemaining() calculation used across queue sorting and cron jobs.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import type { Severity } from "../validation/transition";

export const DEFAULT_SLA_HOURS: Readonly<Record<Severity, number>> = {
  critical: 4,
  high: 24,
  medium: 72,
  low: 168, // 7 days
};

export interface IncidentWithSla {
  sla_target_at?: string | null;
  slaTargetAt?: string | null;
}

/**
 * Calculates remaining hours until SLA target.
 * Positive = hours remaining before breach.
 * Negative = hours breached (overdue).
 * null = no SLA target set on this incident.
 *
 * One pure implementation used across Admin Queue and SLA Escalation scanner.
 */
export function hoursRemaining(incident: IncidentWithSla): number | null {
  const target = incident.slaTargetAt ?? incident.sla_target_at;
  if (!target) return null;

  const targetTime = new Date(target).getTime();
  if (Number.isNaN(targetTime)) return null;

  const now = Date.now();
  const diffHours = (targetTime - now) / (1000 * 60 * 60);
  return Math.round(diffHours * 10) / 10;
}

export function isOverdue(incident: IncidentWithSla): boolean {
  const hours = hoursRemaining(incident);
  return hours !== null && hours < 0;
}

export function calculateTargetDate(
  targetHours: number,
  baseDate: Date = new Date(),
): Date {
  return new Date(baseDate.getTime() + targetHours * 60 * 60 * 1000);
}

/**
 * Assigns SLA target date to an incident based on community SLA policy or system defaults.
 */
export async function assignIncidentSla(
  client: SupabaseClient,
  incidentId: string,
  communityId: string,
  categoryId: string | null,
  severity: Severity | null,
  baseDate: Date = new Date(),
): Promise<Date | null> {
  if (!severity) {
    return null;
  }

  let targetHours: number = DEFAULT_SLA_HOURS[severity];

  if (categoryId) {
    try {
      const { data, error } = await client
        .from("sla_policies")
        .select("target_hours")
        .eq("community_id", communityId)
        .eq("category_id", categoryId)
        .eq("severity", severity)
        .maybeSingle();

      if (!error && data?.target_hours) {
        targetHours = data.target_hours;
      }
    } catch (err) {
      logEvent("warn", "sla.policy_lookup_failed", describeError(err));
    }
  }

  const slaTargetAt = calculateTargetDate(targetHours, baseDate);

  try {
    const { error: updateError } = await client
      .from("incidents")
      .update({ sla_target_at: slaTargetAt.toISOString() })
      .eq("id", incidentId);

    if (updateError) throw updateError;
    return slaTargetAt;
  } catch (err) {
    logEvent("error", "sla.target_update_failed", describeError(err));
    return null;
  }
}
