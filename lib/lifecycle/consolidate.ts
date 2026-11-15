// Incident consolidation (Task 4.2): thin TS wrappers around the three SQL
// functions in supabase/migrations/0010_incident_consolidation.sql, which do
// the actual atomic multi-table work (same split this project uses
// throughout — see lib/auth/claim.ts, lib/auth/admin.ts). Every function
// here takes its Supabase client as a parameter, so it is unit-testable with
// a fake.
//
// Two client roles, same trust split 0010's own header comment explains:
//  - consolidateDefault() / searchOpenIncidentsForIssue(): take the
//    RLS-respecting `db` client (the same one Task 4.1's
//    IntakeClients.db is) — RLS, not this file, is what scopes them to the
//    caller's own community.
//  - mergeIssueIntoIncident(): takes a service-role `admin` client. The
//    caller (app/api/issues/[id]/consolidate/route.ts) MUST have already
//    confirmed committee_admin/maintenance_staff via requireRole() before
//    calling this — merge_issue_into_incident() itself trusts the inputs
//    completely (same model as provisionStaffAccount(), lib/auth/admin.ts).

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import {
  consolidateRpcResultSchema,
  issueForSearchSchema,
  mergeRpcResultSchema,
  openIncidentCandidatesSchema,
} from "../validation/consolidate";

export type ConsolidateDefaultResult =
  | { kind: "linked"; incidentId: string; created: boolean }
  | { kind: "issue_not_found" }
  | { kind: "error" };

/**
 * The pre-AI default (§0.5): every new issue gets its own 1:1 incident,
 * idempotently. Safe to call more than once for the same issue (e.g. once
 * for "created" and again for a "replayed" submission, Task 4.1) — the
 * second call is a no-op that reports the existing incident.
 */
export async function consolidateDefault(
  db: SupabaseClient,
  issueId: string,
): Promise<ConsolidateDefaultResult> {
  try {
    const { data, error } = await db.rpc("consolidate_issue_default", {
      p_issue_id: issueId,
    });
    if (error) {
      if (error.code === "P0002") return { kind: "issue_not_found" };
      throw error;
    }
    const row = consolidateRpcResultSchema.parse(data)[0];
    if (!row) throw new Error("consolidate_issue_default returned no row");
    return {
      kind: "linked",
      incidentId: row.out_incident_id,
      created: row.out_created,
    };
  } catch (error) {
    logEvent("error", "consolidate.default_failed", describeError(error));
    return { kind: "error" };
  }
}

export interface OpenIncidentCandidate {
  id: string;
  canonicalDescription: string | null;
  categoryId: string | null;
  severity: string | null;
  status: string;
  distanceMeters: number;
  createdAt: string;
}

export type SearchCandidatesResult =
  | { kind: "found"; candidates: OpenIncidentCandidate[] }
  | { kind: "issue_not_found" }
  | { kind: "error" };

export interface SearchCandidatesOptions {
  radiusMeters: number;
  windowHours: number;
}

/**
 * Candidates for the admin's manual merge search (§6.6's UI, Phase 9 — this
 * is the backend query it will call). NOT candidate_incidents_for_dedup()
 * (0005): that function requires a category match and returns nothing when
 * category_id is null, which is the common case here — Phase 5 hasn't
 * classified this issue yet. open_incidents_near() (0010) is the same shape
 * minus that requirement; category still narrows the results when the issue
 * happens to have one.
 */
export async function searchOpenIncidentsForIssue(
  db: SupabaseClient,
  issueId: string,
  options: SearchCandidatesOptions,
): Promise<SearchCandidatesResult> {
  try {
    const { data: issueData, error: issueError } = await db
      .from("issues")
      .select("community_id, geo, category_id")
      .eq("id", issueId)
      .maybeSingle();
    if (issueError) throw issueError;
    if (issueData === null) return { kind: "issue_not_found" };
    const issue = issueForSearchSchema.parse(issueData);

    const { data, error } = await db.rpc("open_incidents_near", {
      p_community_id: issue.community_id,
      p_near_geo: issue.geo,
      p_radius_meters: options.radiusMeters,
      p_time_window_hours: options.windowHours,
      p_category_id: issue.category_id,
    });
    if (error) throw error;

    const rows = openIncidentCandidatesSchema.parse(data);
    return {
      kind: "found",
      candidates: rows.map((row) => ({
        id: row.id,
        canonicalDescription: row.canonical_description,
        categoryId: row.category_id,
        severity: row.severity,
        status: row.status,
        distanceMeters: row.distance_meters,
        createdAt: row.created_at,
      })),
    };
  } catch (error) {
    logEvent("error", "consolidate.search_failed", describeError(error));
    return { kind: "error" };
  }
}

export type MergeResult =
  | { kind: "merged"; previousIncidentId: string; targetIncidentId: string }
  | { kind: "different_community" }
  | { kind: "target_not_open" }
  | { kind: "not_found" }
  | { kind: "error" };

/**
 * The admin override (§6.6): re-parents an issue into an existing OPEN
 * incident in the same community. `admin` MUST be a service-role client —
 * the caller must have already confirmed the committee_admin/
 * maintenance_staff role via requireRole() (see this file's header comment).
 * Since 0011 the database ALSO verifies the actor is active staff in the
 * issue's own community (requireRole() alone only proves staff somewhere);
 * "not staff there" and "does not exist" both come back as not_found.
 */
export async function mergeIssueIntoIncident(
  admin: SupabaseClient,
  issueId: string,
  targetIncidentId: string,
  /** The authenticated caller's own resident id (from the session) — never from the request body. */
  actorResidentId: string,
): Promise<MergeResult> {
  try {
    const { data, error } = await admin.rpc("merge_issue_into_incident", {
      p_issue_id: issueId,
      p_target_incident_id: targetIncidentId,
      p_actor_resident_id: actorResidentId,
    });
    if (error) {
      if (error.code === "P0002") return { kind: "not_found" };
      if (error.code === "23514") return { kind: "target_not_open" };
      if (error.code === "22023") return { kind: "different_community" };
      throw error;
    }
    const row = mergeRpcResultSchema.parse(data)[0];
    if (!row) throw new Error("merge_issue_into_incident returned no row");
    return {
      kind: "merged",
      previousIncidentId: row.out_previous_incident_id,
      targetIncidentId: row.out_target_incident_id,
    };
  } catch (error) {
    logEvent("error", "consolidate.merge_failed", describeError(error));
    return { kind: "error" };
  }
}
