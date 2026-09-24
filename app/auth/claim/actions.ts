"use server";

// Server Actions behind the claim form. Both are public endpoints (the
// resident has no session yet), so each one: validates input with Zod,
// rate-limits by IP and by token, re-checks the token against the roster, and
// only then acts. They return notice CODES, never text; the client component
// renders the code in the reader's language.

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  CALLBACK_PATH,
  CLAIM_LIMITS,
  POST_CLAIM_PATH,
  claimRosterEntry,
  getSiteUrl,
  lookupClaimEntry,
  prepareNoEmailSignIn,
} from "@/lib/auth/claim";
import {
  classifyClaimEntry,
  hashClaimToken,
  noticeForEntryState,
  noticeForRefusedOutcome,
} from "@/lib/auth/claim-token";
import { describeError, logEvent } from "@/lib/auth/log";
import {
  enforceRateLimits,
  getClientIp,
  retryAfterMinutes,
} from "@/lib/auth/rate-limit";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  claimWithoutEmailInputSchema,
  requestClaimLinkInputSchema,
  type ClaimFormState,
  type ClaimNoticeCode,
} from "@/lib/validation/claim";

function failure(
  code: ClaimNoticeCode,
  retryAfterMinutesValue?: number,
): ClaimFormState {
  return retryAfterMinutesValue === undefined
    ? { status: "error", code }
    : { status: "error", code, retryAfterMinutes: retryAfterMinutesValue };
}

function field(formData: FormData, name: string): string | null {
  const value = formData.get(name);
  return typeof value === "string" ? value : null;
}

/**
 * Email path: sends a magic link to the address the resident typed. The claim
 * token rides in the link's redirect URL so /auth/callback knows which roster
 * entry to redeem once the email address is proven.
 */
export async function requestClaimLink(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const parsed = requestClaimLinkInputSchema.safeParse({
    token: field(formData, "token"),
    email: field(formData, "email"),
    lang: field(formData, "lang"),
  });
  if (!parsed.success) {
    const emailProblem = parsed.error.issues.some(
      (issue) => issue.path[0] === "email",
    );
    return failure(emailProblem ? "email_invalid" : "link_invalid");
  }
  const { token, email } = parsed.data;

  try {
    const admin = createSupabaseServiceRoleClient();
    const limit = await enforceRateLimits(admin, [
      {
        spec: CLAIM_LIMITS.linkRequestIp,
        identifier: getClientIp(await headers()),
      },
      {
        spec: CLAIM_LIMITS.linkRequestToken,
        identifier: hashClaimToken(token),
      },
      { spec: CLAIM_LIMITS.linkRequestEmail, identifier: email },
    ]);
    if (!limit.allowed) {
      return failure(
        limit.reason === "limit" ? "rate_limited" : "server_error",
        retryAfterMinutes(limit.retryAfterSeconds),
      );
    }

    const lookup = await lookupClaimEntry(admin, token);
    if (lookup.kind === "error") return failure("server_error");
    if (lookup.kind === "not_found") return failure("link_invalid");

    const state = classifyClaimEntry(lookup.entry, new Date());
    if (state !== "claimable") return failure(noticeForEntryState(state));

    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // The claim token is a bearer secret held by this resident and
        // travels only inside their own magic-link email.
        emailRedirectTo: `${getSiteUrl()}${CALLBACK_PATH}?claim=${token}`,
        shouldCreateUser: true,
      },
    });
    if (error) {
      logEvent("warn", "claim.magic_link_send_failed", describeError(error));
      if (error.code === "over_email_send_rate_limit") {
        return failure("rate_limited", 60);
      }
      return failure("send_failed");
    }

    logEvent("info", "claim.magic_link_sent", { entryId: lookup.entry.id });
    return { status: "link_sent", email };
  } catch (error) {
    logEvent("error", "claim.request_link_failed", describeError(error));
    return failure("server_error");
  }
}

/**
 * Admin-link path for residents with no email. Holding the one-time link IS
 * the credential: this starts a session for the entry's synthetic identity and
 * redeems the token in the same request. If the redemption does not complete,
 * the just-created session is dropped so no membership-less session lingers.
 */
export async function claimWithoutEmail(
  _previous: ClaimFormState,
  formData: FormData,
): Promise<ClaimFormState> {
  const parsed = claimWithoutEmailInputSchema.safeParse({
    token: field(formData, "token"),
    lang: field(formData, "lang"),
  });
  if (!parsed.success) return failure("link_invalid");
  const { token } = parsed.data;

  let outcome: ClaimFormState;
  try {
    const admin = createSupabaseServiceRoleClient();
    const limit = await enforceRateLimits(admin, [
      {
        spec: CLAIM_LIMITS.noEmailIp,
        identifier: getClientIp(await headers()),
      },
      { spec: CLAIM_LIMITS.noEmailToken, identifier: hashClaimToken(token) },
    ]);
    if (!limit.allowed) {
      return failure(
        limit.reason === "limit" ? "rate_limited" : "server_error",
        retryAfterMinutes(limit.retryAfterSeconds),
      );
    }

    const lookup = await lookupClaimEntry(admin, token);
    if (lookup.kind === "error") return failure("server_error");
    if (lookup.kind === "not_found") return failure("link_invalid");

    const state = classifyClaimEntry(lookup.entry, new Date());
    if (state !== "claimable") return failure(noticeForEntryState(state));

    const prepared = await prepareNoEmailSignIn(admin, lookup.entry.id);
    if (prepared.kind === "error") return failure("server_error");

    const supabase = await createSupabaseServerClient();
    const verified = await supabase.auth.verifyOtp({
      type: "magiclink",
      token_hash: prepared.tokenHash,
    });
    const authUserId = verified.data.user?.id;
    if (verified.error || !authUserId) {
      logEvent("error", "claim.no_email_sign_in_failed", {
        entryId: lookup.entry.id,
        ...describeError(verified.error),
      });
      return failure("server_error");
    }

    const claim = await claimRosterEntry(admin, { authUserId, token });
    if (claim.kind === "claimed") {
      outcome = { status: "idle" };
    } else {
      await supabase.auth.signOut({ scope: "local" });
      outcome =
        claim.kind === "refused"
          ? failure(noticeForRefusedOutcome(claim.outcome))
          : failure("claim_failed");
    }
  } catch (error) {
    logEvent("error", "claim.no_email_failed", describeError(error));
    return failure("server_error");
  }

  // redirect() throws by design, so it stays outside the try block above.
  if (outcome.status === "idle") redirect(POST_CLAIM_PATH);
  return outcome;
}
