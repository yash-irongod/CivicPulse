// Rate limiting for public endpoints (§9), backed by check_rate_limit() in
// supabase/migrations/0007_rate_limits.sql. Callers pass a service-role client
// (the table is not reachable by anon/authenticated).
//
// Fails CLOSED: if the limiter itself errors, the request is refused. These
// endpoints send email and mint sessions; briefly refusing is cheaper than
// leaving them unmetered.

import { createHash } from "node:crypto";
import { isIP } from "node:net";

import type { SupabaseClient } from "@supabase/supabase-js";

import { rateLimitRpcResultSchema } from "../validation/claim";
import { describeError, logEvent } from "./log";

export interface LimitSpec {
  /** Names the counter, e.g. "claim_link_ip". Distinct per endpoint + dimension. */
  bucket: string;
  limit: number;
  windowSeconds: number;
}

export type RateLimitResult =
  | { allowed: true; remaining: number }
  | {
      allowed: false;
      retryAfterSeconds: number;
      reason: "limit" | "unavailable";
    };

const UNAVAILABLE_RETRY_SECONDS = 30;

/**
 * Best-effort client IP. Assumes the app runs behind Vercel, which overwrites
 * x-forwarded-for with the real client address; on any other host this header
 * is client-controlled and IP limits become weaker (token and email limits
 * still hold). Falls back to a single shared "unknown" bucket, which is
 * stricter, not looser.
 */
export function getClientIp(headers: Pick<Headers, "get">): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded && isIP(forwarded) !== 0) return forwarded;
  const real = headers.get("x-real-ip")?.trim();
  if (real && isIP(real) !== 0) return real;
  return "unknown";
}

/**
 * Opaque key, so IPs and emails never reach the rate_limits table in clear.
 * The input is a JSON array, not "bucket:identifier", so ("a:b", "c") and
 * ("a", "b:c") cannot hash to the same key.
 */
export function rateLimitKey(bucket: string, identifier: string): string {
  return createHash("sha256")
    .update(JSON.stringify([bucket, identifier]), "utf8")
    .digest("hex");
}

export async function checkRateLimit(
  client: SupabaseClient,
  spec: LimitSpec,
  identifier: string,
): Promise<RateLimitResult> {
  try {
    const { data, error } = await client.rpc("check_rate_limit", {
      p_key: rateLimitKey(spec.bucket, identifier),
      p_limit: spec.limit,
      p_window_seconds: spec.windowSeconds,
    });
    if (error) throw error;

    const parsed = rateLimitRpcResultSchema.safeParse(data);
    if (!parsed.success)
      throw new Error("check_rate_limit returned an unexpected shape");

    const row = parsed.data[0];
    if (!row) throw new Error("check_rate_limit returned no row");

    if (row.allowed) return { allowed: true, remaining: row.remaining };
    logEvent("warn", "rate_limit.blocked", { bucket: spec.bucket });
    return {
      allowed: false,
      reason: "limit",
      retryAfterSeconds: Math.max(1, row.retry_after_seconds),
    };
  } catch (error) {
    logEvent("error", "rate_limit.unavailable", {
      bucket: spec.bucket,
      ...describeError(error),
    });
    return {
      allowed: false,
      reason: "unavailable",
      retryAfterSeconds: UNAVAILABLE_RETRY_SECONDS,
    };
  }
}

/** Runs each check in order and returns the first refusal, else an allow. */
export async function enforceRateLimits(
  client: SupabaseClient,
  checks: ReadonlyArray<{ spec: LimitSpec; identifier: string }>,
): Promise<RateLimitResult> {
  let remaining = Number.POSITIVE_INFINITY;
  for (const { spec, identifier } of checks) {
    const result = await checkRateLimit(client, spec, identifier);
    if (!result.allowed) return result;
    remaining = Math.min(remaining, result.remaining);
  }
  return { allowed: true, remaining };
}

export function retryAfterMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}
