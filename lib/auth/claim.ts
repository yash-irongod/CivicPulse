// Server-side claim logic (Task 3.1). Every function takes its Supabase
// client as an argument: the callers pass a SERVICE-ROLE client, and taking
// it as a parameter keeps these functions unit-testable with a fake.
//
// Tenancy rule: community_id, space_id and role are never accepted from a
// caller. They come from the roster row that the claim token resolves to
// (see claim_roster_entry() in 0006), so a client cannot choose which
// community it joins.
//
// Deferred on purpose (§0.3): production SMS-OTP sign-in. Residents claim by
// email magic link or an admin-generated link; phone is stored as a contact
// field only. Nothing here half-builds SMS auth.

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import {
  claimLookupRowSchema,
  claimRpcResultSchema,
  type ClaimOutcome,
  type Lang,
} from "../validation/claim";
import { hashClaimToken, syntheticEmailForEntry } from "./claim-token";
import { describeError, logEvent } from "./log";
import type { LimitSpec } from "./rate-limit";

/** Where a resident lands after a successful claim. */
export const POST_CLAIM_PATH = "/auth/claim/done";
export const CLAIM_PATH = "/auth/claim";
export const CALLBACK_PATH = "/auth/callback";

/**
 * One place for every claim-flow limit. Token and email limits hold even if
 * the IP header is spoofed (see getClientIp).
 */
export const CLAIM_LIMITS = {
  pageViewIp: { bucket: "claim_page_ip", limit: 30, windowSeconds: 600 },
  linkRequestIp: { bucket: "claim_link_ip", limit: 10, windowSeconds: 3600 },
  linkRequestToken: {
    bucket: "claim_link_token",
    limit: 5,
    windowSeconds: 3600,
  },
  linkRequestEmail: {
    bucket: "claim_link_email",
    limit: 3,
    windowSeconds: 3600,
  },
  noEmailIp: { bucket: "claim_noemail_ip", limit: 10, windowSeconds: 3600 },
  noEmailToken: {
    bucket: "claim_noemail_token",
    limit: 5,
    windowSeconds: 3600,
  },
  callbackIp: { bucket: "claim_callback_ip", limit: 30, windowSeconds: 600 },
} as const satisfies Record<string, LimitSpec>;

/** Canonical origin for links we generate, from NEXT_PUBLIC_SITE_URL. */
export function getSiteUrl(): string {
  const parsed = z.url().safeParse(process.env.NEXT_PUBLIC_SITE_URL);
  if (!parsed.success) {
    throw new Error("NEXT_PUBLIC_SITE_URL is missing or not a valid URL");
  }
  return parsed.data.replace(/\/+$/, "");
}

export interface ClaimEntryView {
  id: string;
  status: "pending" | "claimed" | "revoked";
  expiresAt: string | null;
  displayName: string;
  preferredLanguage: Lang;
  spaceName: string | null;
  communityName: string;
  communityDefaultLanguage: Lang;
}

export type LookupResult =
  | { kind: "found"; entry: ClaimEntryView }
  | { kind: "not_found" }
  | { kind: "error" };

/**
 * Resolves a claim token to the roster entry it belongs to. An unknown token
 * and a malformed one are indistinguishable to the caller (both "not_found"),
 * so the response never confirms which tokens exist.
 */
export async function lookupClaimEntry(
  client: SupabaseClient,
  token: string,
): Promise<LookupResult> {
  const tokenHash = hashClaimToken(token);
  try {
    const { data, error } = await client
      .from("roster_entries")
      .select(
        "id, status, claim_token_expires_at, display_name, preferred_language, spaces(name), communities(name, default_language)",
      )
      .eq("claim_token_hash", tokenHash)
      .maybeSingle();
    if (error) throw error;
    if (data === null) return { kind: "not_found" };

    const row = claimLookupRowSchema.parse(data);
    return {
      kind: "found",
      entry: {
        id: row.id,
        status: row.status,
        expiresAt: row.claim_token_expires_at,
        displayName: row.display_name,
        preferredLanguage: row.preferred_language,
        spaceName: row.spaces?.name ?? null,
        communityName: row.communities.name,
        communityDefaultLanguage: row.communities.default_language,
      },
    };
  } catch (error) {
    logEvent("error", "claim.lookup_failed", {
      tokenHashPrefix: tokenHash.slice(0, 8),
      ...describeError(error),
    });
    return { kind: "error" };
  }
}

export type ClaimResult =
  | {
      kind: "claimed";
      residentId: string;
      communityId: string;
      spaceId: string | null;
    }
  | { kind: "refused"; outcome: Exclude<ClaimOutcome, "claimed"> }
  | { kind: "error" };

/**
 * Redeems the token for an authenticated user. `authUserId` MUST come from a
 * verified session (exchangeCodeForSession / verifyOtp), never from request
 * input. The whole redemption is one atomic database call.
 */
export async function claimRosterEntry(
  client: SupabaseClient,
  params: { authUserId: string; token: string },
): Promise<ClaimResult> {
  const tokenHash = hashClaimToken(params.token);
  try {
    const { data, error } = await client.rpc("claim_roster_entry", {
      p_token_hash: tokenHash,
      p_auth_user_id: params.authUserId,
    });
    if (error) throw error;

    const row = claimRpcResultSchema.parse(data)[0];
    if (!row) throw new Error("claim_roster_entry returned no row");

    if (row.claim_outcome !== "claimed") {
      logEvent("info", "claim.refused", {
        outcome: row.claim_outcome,
        tokenHashPrefix: tokenHash.slice(0, 8),
      });
      return { kind: "refused", outcome: row.claim_outcome };
    }
    if (!row.claimed_resident_id || !row.claimed_community_id) {
      throw new Error("claimed outcome is missing resident or community id");
    }

    logEvent("info", "claim.completed", {
      residentId: row.claimed_resident_id,
      communityId: row.claimed_community_id,
    });
    return {
      kind: "claimed",
      residentId: row.claimed_resident_id,
      communityId: row.claimed_community_id,
      spaceId: row.claimed_space_id,
    };
  } catch (error) {
    logEvent("error", "claim.rpc_failed", {
      tokenHashPrefix: tokenHash.slice(0, 8),
      ...describeError(error),
    });
    return { kind: "error" };
  }
}

export type NoEmailSignInPrep =
  { kind: "ready"; tokenHash: string } | { kind: "error" };

/**
 * Admin-link path for a resident with no email. Ensures the entry's synthetic
 * auth user exists and mints a single-use hashed OTP for it; the caller then
 * exchanges that with verifyOtp() on the COOKIE client to start the session.
 * No email is ever sent (email_confirm skips it, generateLink only returns the
 * token). Idempotent per entry: a reissued link signs back in as the same user.
 */
export async function prepareNoEmailSignIn(
  admin: SupabaseClient,
  entryId: string,
): Promise<NoEmailSignInPrep> {
  const email = syntheticEmailForEntry(entryId);
  try {
    const created = await admin.auth.admin.createUser({
      email,
      email_confirm: true,
      // app_metadata is server-controlled; user_metadata is user-editable.
      app_metadata: { claim_channel: "admin_link" },
    });
    if (created.error && created.error.code !== "email_exists") {
      throw created.error;
    }

    const link = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });
    if (link.error) throw link.error;

    const tokenHash = link.data.properties?.hashed_token;
    if (!tokenHash) throw new Error("generateLink returned no hashed_token");
    return { kind: "ready", tokenHash };
  } catch (error) {
    logEvent("error", "claim.no_email_prepare_failed", {
      entryId,
      ...describeError(error),
    });
    return { kind: "error" };
  }
}
