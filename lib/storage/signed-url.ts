// Supabase Storage signed URL generation.
// All photos (issue evidence + resolution proof) live in the "evidence-photos"
// bucket. These are private — RLS allows authenticated uploads/reads, but
// direct public URLs don't work. Signed URLs are time-limited download links
// generated server-side and returned to the client via API responses.

import type { SupabaseClient } from "@supabase/supabase-js";

import { describeError, logEvent } from "../auth/log";

/** Bucket name for all photo evidence (issue + resolution). */
export const EVIDENCE_BUCKET = "evidence-photos";

/** Signed URLs expire after 1 hour (3600 seconds). */
const SIGNED_URL_EXPIRY = 3600;

/**
 * Generate signed download URLs for a list of storage paths in a given bucket.
 * Returns a map from the original path to its signed URL.
 * Missing or errored paths are silently omitted — callers should handle
 * the absence gracefully (e.g. show a "photo unavailable" placeholder).
 */
export async function getSignedUrls(
  client: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<Record<string, string>> {
  const validPaths = paths.filter((p) => p && p.trim().length > 0);
  if (validPaths.length === 0) return {};

  try {
    const { data, error } = await client.storage
      .from(bucket)
      .createSignedUrls(validPaths, SIGNED_URL_EXPIRY);

    if (error) {
      logEvent("warn", "storage.signed_urls_failed", describeError(error));
      return {};
    }

    const result: Record<string, string> = {};
    for (const item of data || []) {
      // Supabase returns the path and signedUrl (or error) for each request
      if (item.signedUrl && !item.error) {
        // The path in the response may differ in casing; use the original
        const matchPath = item.path ?? "";
        if (matchPath) {
          result[matchPath] = item.signedUrl;
        }
      }
    }
    return result;
  } catch (err) {
    logEvent("warn", "storage.signed_urls_exception", describeError(err));
    return {};
  }
}

/**
 * Generate a signed URL for a single storage path.
 * Returns null if the path is empty or signing fails.
 */
export async function getSignedUrl(
  client: SupabaseClient,
  bucket: string,
  path: string | null | undefined,
): Promise<string | null> {
  if (!path || path.trim().length === 0) return null;

  const urls = await getSignedUrls(client, bucket, [path]);
  return urls[path] ?? null;
}
