// SLA Escalation Scanner (Task 6.2, §6.5).
// Scans for incidents nearing or past their SLA target and alerts committee admins.
// Emits once per breach using the sla_breach_alerts table.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import { hoursRemaining } from "../lifecycle/sla";
import { notify } from "../notify/service";

export interface SlaScannerResult {
  scanned: number;
  alerted: number;
  errors: number;
}

export async function runSlaScanner(
  adminClient: SupabaseClient,
  leadTimeHours: number = 2,
): Promise<SlaScannerResult> {
  const result: SlaScannerResult = {
    scanned: 0,
    alerted: 0,
    errors: 0,
  };

  const horizon = new Date(
    Date.now() + leadTimeHours * 3600 * 1000,
  ).toISOString();

  try {
    // 1. Query open incidents approaching or past SLA target
    const { data: candidates, error: fetchError } = await adminClient
      .from("incidents")
      .select("id, community_id, severity, sla_target_at")
      .not("sla_target_at", "is", null)
      .lte("sla_target_at", horizon)
      .not(
        "status",
        "in",
        '("resolved","resident_feedback","escalated","closed")',
      );

    if (fetchError) throw fetchError;
    if (!candidates || candidates.length === 0) {
      return result;
    }

    result.scanned = candidates.length;

    // 2. Filter out incidents already alerted
    const candidateIds = candidates.map((c) => c.id);
    const { data: alreadyAlerted } = await adminClient
      .from("sla_breach_alerts")
      .select("incident_id")
      .in("incident_id", candidateIds);

    const alertedSet = new Set(alreadyAlerted?.map((a) => a.incident_id) ?? []);
    const unalerted = candidates.filter((c) => !alertedSet.has(c.id));

    // 3. For each breach candidate, notify all committee_admin members in that community
    for (const incident of unalerted) {
      try {
        const { data: adminMembers } = await adminClient
          .from("memberships")
          .select("resident_id")
          .eq("community_id", incident.community_id)
          .eq("role", "committee_admin")
          .eq("status", "active");

        const remaining =
          hoursRemaining({ sla_target_at: incident.sla_target_at }) ?? 0;

        if (adminMembers && adminMembers.length > 0) {
          for (const m of adminMembers) {
            await notify(adminClient, m.resident_id, "sla_breach_imminent", {
              incidentId: incident.id,
              hoursRemaining: remaining,
              severity: incident.severity || "medium",
            });
          }
        }

        // Record in sla_breach_alerts so this incident is not alerted repeatedly
        await adminClient.from("sla_breach_alerts").insert({
          incident_id: incident.id,
        });

        result.alerted++;
      } catch (err) {
        result.errors++;
        logEvent("error", "sla_scanner.alert_failed", {
          incidentId: incident.id,
          ...describeError(err),
        });
      }
    }
  } catch (err) {
    result.errors++;
    logEvent("error", "sla_scanner.scan_failed", describeError(err));
  }

  return result;
}
