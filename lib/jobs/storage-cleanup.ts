// Storage Cleanup Job.
// Automatically cleans up photo evidence for tickets that have been closed for over
// RETENTION_DAYS (default: 90 days), preserving audit trails and incident records
// while ensuring free-tier Supabase storage (1 GB) never fills up.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";
import { EVIDENCE_BUCKET } from "../storage/signed-url";

export const DEFAULT_RETENTION_DAYS = 90;

export interface StorageCleanupResult {
  scannedIncidents: number;
  cleanedPhotosCount: number;
}

/**
 * Clean up old photo files from closed incidents past retention period.
 */
export async function runStorageCleanup(
  client: SupabaseClient,
  retentionDays = DEFAULT_RETENTION_DAYS,
): Promise<StorageCleanupResult> {
  const result: StorageCleanupResult = {
    scannedIncidents: 0,
    cleanedPhotosCount: 0,
  };

  try {
    const cutoffDate = new Date(
      Date.now() - retentionDays * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 1. Find closed incidents older than cutoffDate that still have photos
    const { data: oldIncidents, error: fetchErr } = await client
      .from("incidents")
      .select(
        `
        id,
        community_id,
        closed_at,
        resolution_before_photo,
        resolution_after_photo
      `,
      )
      .eq("status", "closed")
      .lt("closed_at", cutoffDate);

    if (fetchErr) throw fetchErr;
    if (!oldIncidents || oldIncidents.length === 0) {
      return result;
    }

    result.scannedIncidents = oldIncidents.length;

    const filesToDelete: string[] = [];
    const incidentIdsToUpdate: string[] = [];

    for (const inc of oldIncidents) {
      let hasPhotos = false;
      if (inc.resolution_before_photo) {
        filesToDelete.push(inc.resolution_before_photo);
        hasPhotos = true;
      }
      if (inc.resolution_after_photo) {
        filesToDelete.push(inc.resolution_after_photo);
        hasPhotos = true;
      }
      if (hasPhotos) {
        incidentIdsToUpdate.push(inc.id);
      }
    }

    // 2. Also check linked issues for old incidents
    const { data: linkedIssues } = await client
      .from("incident_issues")
      .select("issue:issues(id, photo_paths)")
      .in(
        "incident_id",
        oldIncidents.map((i) => i.id),
      );

    const issueIdsToUpdate: string[] = [];
    if (linkedIssues) {
      for (const row of linkedIssues) {
        const rawIssue = (
          row as {
            issue:
              | { id: string; photo_paths: string[] }
              | Array<{ id: string; photo_paths: string[] }>
              | null;
          }
        ).issue;
        const issue = Array.isArray(rawIssue) ? rawIssue[0] : rawIssue;
        if (issue && issue.photo_paths && issue.photo_paths.length > 0) {
          filesToDelete.push(...issue.photo_paths);
          issueIdsToUpdate.push(issue.id);
        }
      }
    }

    // 3. Delete files from storage bucket
    if (filesToDelete.length > 0) {
      const { error: removeErr } = await client.storage
        .from(EVIDENCE_BUCKET)
        .remove(filesToDelete);

      if (removeErr) {
        logEvent(
          "warn",
          "storage.cleanup_remove_failed",
          describeError(removeErr),
        );
      } else {
        result.cleanedPhotosCount = filesToDelete.length;
      }

      // Null out photo paths on incidents
      if (incidentIdsToUpdate.length > 0) {
        await client
          .from("incidents")
          .update({
            resolution_before_photo: null,
            resolution_after_photo: null,
          })
          .in("id", incidentIdsToUpdate);
      }

      // Null out photo paths on issues
      if (issueIdsToUpdate.length > 0) {
        await client
          .from("issues")
          .update({ photo_paths: [] })
          .in("id", issueIdsToUpdate);
      }
    }

    logEvent("info", "storage.cleanup_completed", {
      retentionDays,
      ...result,
    });

    return result;
  } catch (err) {
    logEvent("error", "storage.cleanup_failed", describeError(err));
    return result;
  }
}
