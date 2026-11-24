// The incident lifecycle (§6.5) as an explicit transition table, plus the
// wrapper around transition_incident() (supabase/migrations/0011).
//
// Split like lib/auth/roles.ts: the table and isValidTransition() are pure
// (unit-tested with no DB); transitionIncident() is the one I/O function and
// takes its Supabase clients as parameters so it is testable with a fake.
//
// The table is deliberately STRICT: forward one step at a time, plus the ONE
// documented backward move — resident_feedback -> assigned, the reopen a
// resident's "no, not fixed" answer triggers (Phase 8.4). There is no
// general "undo": an admin who advances an incident by mistake cannot step
// it back through this API. That is a deliberate reading of the plan's "no
// arbitrary status writes," not an oversight; add a specific, audited
// correction path if the pilot shows it is needed.
//
// 0011's transition_incident() carries a hand-maintained copy of this table
// as the database's own last line of defense (see that file's header). The
// pgTAP suite (tests/db/incident_transitions.test.sql) and this file's unit
// test (tests/lib/lifecycle/state-machine.test.ts) each check the FULL
// 10x10 matrix against the same literal list of allowed pairs, so editing
// one table without the other fails a test.
//
// Every transition through this module is human-driven (actor = the calling
// admin/staff member). Phase 5's automatic Validated / EvidenceChecked steps
// (§6.5) will be a separate, system-driven path (actor null) — they are not
// built, and not faked, here.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import {
  INCIDENT_STATUSES,
  incidentStatusRowSchema,
  transitionRpcResultSchema,
  type IncidentStatus,
} from "../validation/transition";

export { INCIDENT_STATUSES, type IncidentStatus };

const TRANSITIONS: Readonly<Record<IncidentStatus, readonly IncidentStatus[]>> =
  {
    reported: ["validated"],
    validated: ["prioritized"],
    prioritized: ["assigned"],
    assigned: ["in_progress"],
    in_progress: ["resolution_submitted"],
    resolution_submitted: ["evidence_checked", "assigned"],
    evidence_checked: ["resolved", "assigned"],
    resolved: ["resident_feedback"],
    // ≥ 4 stars → closed. ≤ 3 stars → escalated to admin.
    // Residents do NOT have direct reopen power.
    resident_feedback: ["closed", "escalated"],
    // Admin decides: reopen for rework or force-close.
    escalated: ["assigned", "closed"],
    closed: [],
  };

/** Statuses an incident currently at `from` may move to. Empty for the terminal `closed`. */
export function allowedTransitions(
  from: IncidentStatus,
): readonly IncidentStatus[] {
  return TRANSITIONS[from];
}

export function isValidTransition(
  from: IncidentStatus,
  to: IncidentStatus,
): boolean {
  return TRANSITIONS[from].includes(to);
}

export interface TransitionClients {
  /** RLS-respecting, acting as the signed-in admin — used only to read the incident's current status (community-scoped by RLS). */
  db: SupabaseClient;
  /** service-role — transition_incident() is service_role-only (0011). */
  admin: SupabaseClient;
}

export interface TransitionInput {
  incidentId: string;
  /** The authenticated caller's own resident id (from the session) — never from the request body. */
  actorResidentId: string;
  toStatus?: IncidentStatus;
  categoryId?: string;
  assignedTeamId?: string;
  severity?: string;
  note?: string;
}

export type TransitionResult =
  | {
      kind: "transitioned";
      incidentId: string;
      fromStatus: IncidentStatus;
      toStatus: IncidentStatus;
      /** null when the call was assignment-only (nothing transitioned, so no history row). */
      historyId: string | null;
    }
  | {
      kind: "invalid_transition";
      from: IncidentStatus;
      to: IncidentStatus;
      allowed: readonly IncidentStatus[];
    }
  /** Missing, or not the caller's to touch — deliberately one result (see 0011's actor check). */
  | { kind: "not_found" }
  /** category/team from another community or nonexistent (incidents_enforce_same_community, 0004). */
  | { kind: "invalid_assignment" }
  | { kind: "error" };

export async function transitionIncident(
  clients: TransitionClients,
  input: TransitionInput,
): Promise<TransitionResult> {
  const { db, admin } = clients;
  try {
    // Read first, for a specific rejection (what it is, what it may become)
    // rather than a bare database error. This read is advisory: the SQL
    // function re-checks inside its own transaction, under an advisory lock,
    // so a concurrent transition between this read and the write is still
    // caught — it just surfaces as the less detailed invalid_transition
    // below.
    const { data: row, error: readError } = await db
      .from("incidents")
      .select("status")
      .eq("id", input.incidentId)
      .maybeSingle();
    if (readError) throw readError;
    if (row === null) return { kind: "not_found" };
    const current = incidentStatusRowSchema.parse(row).status;

    if (
      input.toStatus !== undefined &&
      !isValidTransition(current, input.toStatus)
    ) {
      return {
        kind: "invalid_transition",
        from: current,
        to: input.toStatus,
        allowed: allowedTransitions(current),
      };
    }

    const { data, error } = await admin.rpc("transition_incident", {
      p_incident_id: input.incidentId,
      p_actor_resident_id: input.actorResidentId,
      p_to_status: input.toStatus ?? null,
      p_category_id: input.categoryId ?? null,
      p_assigned_team_id: input.assignedTeamId ?? null,
      p_severity: input.severity ?? null,
      p_note: input.note ?? null,
    });
    if (error) {
      if (error.code === "P0002") return { kind: "not_found" };
      // 22023: the in-database table disagreed (a concurrent transition moved
      // the incident after our read). Re-read for an accurate answer.
      if (error.code === "22023" && input.toStatus !== undefined) {
        return await rereadInvalid(db, input.incidentId, input.toStatus);
      }
      // P0001: the plain RAISE EXCEPTION from incidents_enforce_same_community.
      if (error.code === "P0001") return { kind: "invalid_assignment" };
      throw error;
    }

    const result = transitionRpcResultSchema.parse(data)[0];
    if (!result) throw new Error("transition_incident returned no row");
    return {
      kind: "transitioned",
      incidentId: result.out_incident_id,
      fromStatus: result.out_from_status,
      toStatus: result.out_to_status,
      historyId: result.out_history_id,
    };
  } catch (error) {
    logEvent("error", "lifecycle.transition_failed", describeError(error));
    return { kind: "error" };
  }
}

async function rereadInvalid(
  db: SupabaseClient,
  incidentId: string,
  to: IncidentStatus,
): Promise<TransitionResult> {
  const { data, error } = await db
    .from("incidents")
    .select("status")
    .eq("id", incidentId)
    .maybeSingle();
  if (error) throw error;
  if (data === null) return { kind: "not_found" };
  const from = incidentStatusRowSchema.parse(data).status;
  return {
    kind: "invalid_transition",
    from,
    to,
    allowed: allowedTransitions(from),
  };
}
