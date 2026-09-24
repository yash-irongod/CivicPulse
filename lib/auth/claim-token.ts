// Pure helpers for the claim flow: token hashing, the synthetic no-email
// identity, roster-entry state, and outcome-to-notice mapping. No I/O here so
// all of it is unit-testable (tests/lib/auth/claim-token.test.ts).

import { createHash } from "node:crypto";

import {
  SYNTHETIC_EMAIL_DOMAIN,
  type ClaimNoticeCode,
  type ClaimOutcome,
} from "../validation/claim";

/**
 * SHA-256 hex of the exact token string (UTF-8). Must stay byte-for-byte the
 * same as `encode(sha256(convert_to(token, 'UTF8')), 'hex')` in
 * supabase/migrations/0006_resident_roster.sql: the database stores only this
 * hash, so the two sides agreeing is what makes a token redeemable. Both test
 * suites assert the same vector for "abc".
 */
export function hashClaimToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * The sign-in identity for a resident with no email. One per roster entry, so
 * a reissued link for the same entry signs back in as the same auth user
 * (claim_roster_entry() only lets the bound user re-claim).
 */
export function syntheticEmailForEntry(entryId: string): string {
  return `roster-${entryId.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}

export type ClaimEntryState = "claimable" | "claimed" | "revoked" | "expired";

/**
 * Whether a looked-up roster entry can be claimed right now. Mirrors the
 * checks inside claim_roster_entry(), which remains the authority; this only
 * lets the page and actions refuse early with a precise message. A pending
 * entry with no expiry is treated as expired (fail closed) even though the
 * table constraint should make that impossible.
 */
export function classifyClaimEntry(
  entry: {
    status: "pending" | "claimed" | "revoked";
    expiresAt: string | null;
  },
  now: Date,
): ClaimEntryState {
  if (entry.status === "revoked") return "revoked";
  if (entry.status === "claimed") return "claimed";
  if (entry.expiresAt === null) return "expired";
  const expires = Date.parse(entry.expiresAt);
  if (Number.isNaN(expires) || expires <= now.getTime()) return "expired";
  return "claimable";
}

export function noticeForEntryState(
  state: Exclude<ClaimEntryState, "claimable">,
): ClaimNoticeCode {
  switch (state) {
    case "claimed":
      return "link_used";
    case "revoked":
      return "link_revoked";
    case "expired":
      return "link_expired";
  }
}

/**
 * Message for a refused claim_roster_entry() outcome. "bound_to_other_user"
 * shows the generic invalid-link message on purpose: it reveals nothing about
 * who the entry belongs to.
 */
export function noticeForRefusedOutcome(
  outcome: Exclude<ClaimOutcome, "claimed">,
): ClaimNoticeCode {
  switch (outcome) {
    case "already_claimed":
      return "link_used";
    case "expired":
      return "link_expired";
    case "revoked":
      return "link_revoked";
    case "invalid":
    case "bound_to_other_user":
      return "link_invalid";
  }
}
