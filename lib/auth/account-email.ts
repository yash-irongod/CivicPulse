// Pure helpers for in-app account email resolution and synthetic fallback mapping.

import { SYNTHETIC_EMAIL_DOMAIN } from "../validation/claim";
import { syntheticEmailForEntry } from "./claim-token";

/**
 * Returns a user's real email address for UI & notifications, hiding synthetic
 * `.invalid` placeholder accounts created during 1-tap onboarding.
 */
export function extractPublicEmail(
  rawEmail: string | null | undefined,
): string | null {
  if (!rawEmail) return null;
  const trimmed = rawEmail.trim();
  if (!trimmed || trimmed.toLowerCase().endsWith(".invalid")) {
    return null;
  }
  return trimmed;
}

/**
 * Restores a valid `.invalid` placeholder when a member removes their email,
 * preferring their original roster synthetic email so future link reissues stay aligned.
 */
export function buildFallbackSyntheticEmail(
  residentId: string,
  rosterEntryId?: string | null,
): string {
  if (rosterEntryId) {
    return syntheticEmailForEntry(rosterEntryId);
  }
  return `no-email-${residentId.toLowerCase()}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
