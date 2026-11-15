// Zod schemas and shared types for Task 4.2: Incident Consolidation.
// Used by lib/lifecycle/consolidate.ts and app/api/issues/[id]/consolidate/route.ts.
// Imports in lib/ use relative paths, matching the rest of lib/.

import { z } from "zod";

/** Result row returned by the consolidate_issue_default RPC function. */
export const consolidateRpcRowSchema = z.object({
  out_incident_id: z.guid(),
  out_created: z.boolean(),
});
export const consolidateRpcResultSchema = z.array(consolidateRpcRowSchema);

/** Issue row required to search for nearby open incidents. */
export const issueForSearchSchema = z.object({
  community_id: z.guid(),
  geo: z.unknown(),
  category_id: z.guid().nullable(),
});

/** Candidate open incident returned by open_incidents_near RPC. */
export const openIncidentCandidateRowSchema = z.object({
  id: z.guid(),
  canonical_description: z.string().nullable(),
  category_id: z.guid().nullable(),
  severity: z.string().nullable(),
  status: z.string(),
  distance_meters: z.number(),
  created_at: z.string(),
});
export const openIncidentCandidatesSchema = z.array(
  openIncidentCandidateRowSchema,
);

/** Result row returned by the merge_issue_into_incident RPC function. */
export const mergeRpcRowSchema = z.object({
  out_previous_incident_id: z.guid(),
  out_target_incident_id: z.guid(),
});
export const mergeRpcResultSchema = z.array(mergeRpcRowSchema).length(1);

/** Body schema for POST /api/issues/[id]/consolidate. */
export const mergeRequestSchema = z.object({
  targetIncidentId: z.guid(),
});
export type MergeRequest = z.infer<typeof mergeRequestSchema>;

/** Query parameters for GET /api/issues/[id]/consolidate. */
export const searchQuerySchema = z.object({
  radiusMeters: z.coerce.number().positive().default(500),
  windowHours: z.coerce.number().positive().default(72),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
