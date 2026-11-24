// Zod schemas for Task 4.3's transition route and its RPC result.
// Imports in lib/ use relative paths, matching the rest of lib/.

import { z } from "zod";

export const INCIDENT_STATUSES = [
  "reported",
  "validated",
  "prioritized",
  "assigned",
  "in_progress",
  "resolution_submitted",
  "evidence_checked",
  "resolved",
  "resident_feedback",
  "escalated",
  "closed",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
export const incidentStatusSchema = z.enum(INCIDENT_STATUSES);

export const SEVERITY_VALUES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITY_VALUES)[number];
export const severitySchema = z.enum(SEVERITY_VALUES);

export const MAX_NOTE_LENGTH = 1000;

/**
 * Every field optional, but at least one required: a request that asks for
 * nothing is a client bug worth a 400, not a silent no-op 200. `toStatus`
 * omitted means "assignment only, no transition" (transition_incident(),
 * 0011) — category/team/severity can be set without moving the incident.
 *
 * No actor field: the actor is ALWAYS the authenticated caller's own
 * resident id, taken from the session server-side, never from the body.
 */
export const transitionRequestSchema = z
  .object({
    toStatus: incidentStatusSchema.optional(),
    categoryId: z.guid().optional(),
    assignedTeamId: z.guid().optional(),
    severity: z.enum(SEVERITY_VALUES).optional(),
    note: z.string().trim().min(1).max(MAX_NOTE_LENGTH).optional(),
  })
  .refine(
    (value) =>
      value.toStatus !== undefined ||
      value.categoryId !== undefined ||
      value.assignedTeamId !== undefined ||
      value.severity !== undefined,
    { message: "empty_request" },
  )
  // A note annotates a transition's history row. With no transition there is
  // no row to attach it to — refuse rather than silently drop what the admin
  // typed.
  .refine((value) => value.note === undefined || value.toStatus !== undefined, {
    message: "note_requires_transition",
  });
export type TransitionRequest = z.infer<typeof transitionRequestSchema>;

// z.guid(), same reasoning as lib/validation/claim.ts.
export const transitionRpcRowSchema = z.object({
  out_incident_id: z.guid(),
  out_from_status: incidentStatusSchema,
  out_to_status: incidentStatusSchema,
  out_history_id: z.guid().nullable(),
});
export const transitionRpcResultSchema = z
  .array(transitionRpcRowSchema)
  .length(1);

export const incidentStatusRowSchema = z.object({
  status: incidentStatusSchema,
});
