// Incident Notification Dispatcher.
// Helper methods to route lifecycle notifications to the appropriate parties:
// - Reporters (residents who filed linked issues)
// - Society committee admins
//
// All operations are safe and fire-and-forget: failure to deliver a notification
// never rolls back the database transition.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import { notify } from "./service";
import type { NotificationPayloadMap, NotificationType } from "./templates";

/**
 * Finds all unique reporter resident IDs for an incident.
 */
export async function getIncidentReporters(
  client: SupabaseClient,
  incidentId: string,
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from("incident_issues")
      .select("issue:issues(reporter_id)")
      .eq("incident_id", incidentId);

    if (error || !data) {
      logEvent("warn", "notify.get_reporters_failed", describeError(error));
      return [];
    }

    const reporterIds = new Set<string>();
    for (const row of data) {
      const rawIssue = (
        row as {
          issue:
            | { reporter_id: string | null }
            | Array<{ reporter_id: string | null }>
            | null;
        }
      ).issue;
      const issue = Array.isArray(rawIssue) ? rawIssue[0] : rawIssue;
      if (issue?.reporter_id) {
        reporterIds.add(issue.reporter_id);
      }
    }
    return Array.from(reporterIds);
  } catch (err) {
    logEvent("warn", "notify.get_reporters_exception", describeError(err));
    return [];
  }
}

/**
 * Finds all active committee admin resident IDs for a community.
 */
export async function getCommunityAdmins(
  client: SupabaseClient,
  communityId: string,
): Promise<string[]> {
  try {
    const { data, error } = await client
      .from("memberships")
      .select("resident_id")
      .eq("community_id", communityId)
      .eq("role", "committee_admin")
      .eq("status", "active");

    if (error || !data) return [];
    return data
      .map((m: { resident_id: string }) => m.resident_id)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Dispatches a notification to all residents who filed reports linked to this incident.
 */
export async function notifyReporters<T extends NotificationType>(
  client: SupabaseClient,
  incidentId: string,
  type: T,
  payload: NotificationPayloadMap[T],
): Promise<void> {
  try {
    const reporterIds = await getIncidentReporters(client, incidentId);
    await Promise.all(
      reporterIds.map((residentId) =>
        notify(client, residentId, type, payload).catch((err) => {
          logEvent("warn", "notify.reporter_dispatch_failed", {
            residentId,
            incidentId,
            ...describeError(err),
          });
        }),
      ),
    );
  } catch (err) {
    logEvent("warn", "notify.notify_reporters_failed", describeError(err));
  }
}

/**
 * Dispatches a notification to all active committee admins in the community.
 */
export async function notifyAdmins<T extends NotificationType>(
  client: SupabaseClient,
  communityId: string,
  type: T,
  payload: NotificationPayloadMap[T],
): Promise<void> {
  try {
    const adminIds = await getCommunityAdmins(client, communityId);
    await Promise.all(
      adminIds.map((residentId) =>
        notify(client, residentId, type, payload).catch((err) => {
          logEvent("warn", "notify.admin_dispatch_failed", {
            residentId,
            communityId,
            ...describeError(err),
          });
        }),
      ),
    );
  } catch (err) {
    logEvent("warn", "notify.notify_admins_failed", describeError(err));
  }
}

/**
 * Dispatches notifications corresponding to an incident lifecycle transition.
 */
export async function dispatchTransitionNotifications(
  client: SupabaseClient,
  params: {
    incidentId: string;
    fromStatus: string;
    toStatus: string;
    communityId?: string;
    assignedTeamName?: string | null;
  },
): Promise<void> {
  const { incidentId, fromStatus, toStatus, communityId, assignedTeamName } =
    params;

  try {
    // 1. If assigned to a team, inform reporters
    if (toStatus === "assigned") {
      if (assignedTeamName) {
        await notifyReporters(client, incidentId, "incident_assigned", {
          incidentId,
          teamName: assignedTeamName,
        });
      } else {
        await notifyReporters(client, incidentId, "status_changed", {
          incidentId,
          fromStatus,
          toStatus,
        });
      }
      return;
    }

    // 2. If resolved or awaiting feedback, request resident confirmation
    if (toStatus === "resident_feedback" || toStatus === "resolved") {
      await notifyReporters(client, incidentId, "resolved_confirmation", {
        incidentId,
      });
      return;
    }

    // 3. For any other status change, send status update to reporters
    await notifyReporters(client, incidentId, "status_changed", {
      incidentId,
      fromStatus,
      toStatus,
    });

    // 4. If escalated and communityId provided, alert admins
    if (toStatus === "escalated" && communityId) {
      await notifyAdmins(client, communityId, "status_changed", {
        incidentId,
        fromStatus,
        toStatus: "escalated",
      });
    }
  } catch (err) {
    logEvent("warn", "notify.transition_dispatch_failed", describeError(err));
  }
}
