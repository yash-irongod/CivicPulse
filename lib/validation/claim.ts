// Zod schemas and shared types for the resident claim flow (Task 3.1).
//
// Imports in lib/ use relative paths (not the "@/" alias) so the modules the
// unit tests reach stay resolvable without any vitest alias configuration.

import { z } from "zod";

export const SUPPORTED_LANGS = ["en", "hi"] as const;
export const langSchema = z.enum(SUPPORTED_LANGS);
export type Lang = z.infer<typeof langSchema>;

/**
 * Reserved-TLD domain for the synthetic sign-in identity given to residents
 * who have no email (RFC 2606: ".invalid" can never resolve, so a real inbox
 * can never collide with it). Real email input ending in ".invalid" is
 * rejected below so nobody can type one in.
 */
export const SYNTHETIC_EMAIL_DOMAIN = "no-email.nivas.invalid";

/** 64 lowercase hex chars, matching what provision_roster_entries() emits. */
export const CLAIM_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export const claimTokenSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(CLAIM_TOKEN_PATTERN);

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(254)
  .pipe(z.email())
  .refine((value) => !value.endsWith(".invalid"));

export const requestClaimLinkInputSchema = z.object({
  token: claimTokenSchema,
  email: emailSchema,
  lang: langSchema,
});
export type RequestClaimLinkInput = z.infer<typeof requestClaimLinkInputSchema>;

export const claimWithoutEmailInputSchema = z.object({
  token: claimTokenSchema,
  lang: langSchema,
});
export type ClaimWithoutEmailInput = z.infer<
  typeof claimWithoutEmailInputSchema
>;

/** What /auth/callback receives: Supabase's PKCE code plus our claim token. */
export const callbackQuerySchema = z.object({
  code: z.string().trim().min(1).max(2048),
  claim: claimTokenSchema,
});

// --- Notices ---------------------------------------------------------------

/**
 * Every message the claim flow can show. Each code has a `<code>_title` and
 * `<code>_body` entry in both languages in lib/i18n/claim-strings.ts.
 */
export const CLAIM_NOTICE_CODES = [
  "link_missing",
  "link_invalid",
  "link_used",
  "link_expired",
  "link_revoked",
  "rate_limited",
  "server_error",
  "email_invalid",
  "send_failed",
  "claim_failed",
  "callback_failed",
] as const;
export type ClaimNoticeCode = (typeof CLAIM_NOTICE_CODES)[number];

/** Codes /auth/callback may pass back to the claim page in `?error=`. */
export const claimPageErrorSchema = z.enum([
  "callback_failed",
  "claim_failed",
  "rate_limited",
  "server_error",
]);
export type ClaimPageError = z.infer<typeof claimPageErrorSchema>;

export type ClaimFormState =
  | { status: "idle" }
  | { status: "error"; code: ClaimNoticeCode; retryAfterMinutes?: number }
  | { status: "link_sent"; email: string };

export interface ClaimPageQuery {
  /** Raw, unvalidated: the page distinguishes "absent" from "malformed". */
  token: string | undefined;
  lang: Lang | undefined;
  error: ClaimPageError | undefined;
  waitMinutes: number | undefined;
}

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Lenient on purpose: an unrecognised `lang`/`error`/`wait` is ignored rather
 * than failing the page, since only `token` is security-relevant.
 */
export function parseClaimPageQuery(raw: RawSearchParams): ClaimPageQuery {
  const token = firstValue(raw.token);
  const lang = langSchema.safeParse(firstValue(raw.lang));
  const error = claimPageErrorSchema.safeParse(firstValue(raw.error));
  const wait = z.coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .safeParse(firstValue(raw.wait));

  return {
    token: token === undefined ? undefined : token.slice(0, 200),
    lang: lang.success ? lang.data : undefined,
    error: error.success ? error.data : undefined,
    waitMinutes: wait.success ? wait.data : undefined,
  };
}

// --- Database result shapes (validated before being trusted, §9) -----------

export const CLAIM_OUTCOMES = [
  "claimed",
  "invalid",
  "already_claimed",
  "expired",
  "revoked",
  "bound_to_other_user",
] as const;
export const claimOutcomeSchema = z.enum(CLAIM_OUTCOMES);
export type ClaimOutcome = z.infer<typeof claimOutcomeSchema>;

// z.guid() rather than z.uuid(): Postgres ids are always well-formed, and the
// stricter RFC-version check would only reject valid fixture data.
export const claimRpcRowSchema = z.object({
  claim_outcome: claimOutcomeSchema,
  claimed_resident_id: z.guid().nullable(),
  claimed_community_id: z.guid().nullable(),
  claimed_space_id: z.guid().nullable(),
});
export const claimRpcResultSchema = z.array(claimRpcRowSchema).length(1);

export const rosterStatusSchema = z.enum(["pending", "claimed", "revoked"]);

export const claimLookupRowSchema = z.object({
  id: z.guid(),
  status: rosterStatusSchema,
  claim_token_expires_at: z.string().nullable(),
  display_name: z.string(),
  preferred_language: langSchema,
  spaces: z.object({ name: z.string() }).nullable(),
  communities: z.object({
    name: z.string(),
    default_language: langSchema,
  }),
});

export const rateLimitRpcResultSchema = z
  .array(
    z.object({
      allowed: z.boolean(),
      remaining: z.number().int(),
      retry_after_seconds: z.number().int(),
    }),
  )
  .length(1);
