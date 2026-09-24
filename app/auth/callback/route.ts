// Magic-link landing route (Task 3.1). The email link comes back here as
// /auth/callback?code=<Supabase PKCE code>&claim=<roster claim token>.
// Order matters: prove the email (exchange the code for a session), THEN
// redeem the claim for that verified user. The user id is never read from
// the query string.
//
// PKCE ties the code to the browser that requested it. If the resident opens
// the email in a different browser (for example Gmail's in-app viewer), the
// exchange fails; they are sent back to the claim page with the claim token
// still valid and a message saying how to retry.

import { NextResponse, type NextRequest } from "next/server";

import {
  CLAIM_LIMITS,
  CLAIM_PATH,
  POST_CLAIM_PATH,
  claimRosterEntry,
  getSiteUrl,
} from "@/lib/auth/claim";
import { noticeForRefusedOutcome } from "@/lib/auth/claim-token";
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
  callbackQuerySchema,
  claimTokenSchema,
  type ClaimPageError,
} from "@/lib/validation/claim";

// Canonical origin from NEXT_PUBLIC_SITE_URL; if that is unset, fall back to
// the request's own origin so even a misconfigured deploy can still redirect.
function originFor(request: NextRequest): string {
  try {
    return getSiteUrl();
  } catch {
    return request.nextUrl.origin;
  }
}

function redirectTo(
  request: NextRequest,
  path: string,
  params: Record<string, string> = {},
): NextResponse {
  const url = new URL(path, originFor(request));
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = NextResponse.redirect(url);
  response.headers.set("Cache-Control", "no-store");
  // The claim token is in this URL; keep it out of any Referer header.
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

function backToClaim(
  request: NextRequest,
  token: string | null,
  error?: ClaimPageError,
  extra: Record<string, string> = {},
): NextResponse {
  const params: Record<string, string> = { ...extra };
  if (token) params.token = token;
  if (error) params.error = error;
  return redirectTo(request, CLAIM_PATH, params);
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const searchParams = request.nextUrl.searchParams;
  const claimToken = claimTokenSchema.safeParse(searchParams.get("claim"));
  const token = claimToken.success ? claimToken.data : null;

  try {
    const admin = createSupabaseServiceRoleClient();

    const limit = await enforceRateLimits(admin, [
      {
        spec: CLAIM_LIMITS.callbackIp,
        identifier: getClientIp(request.headers),
      },
    ]);
    if (!limit.allowed) {
      return backToClaim(
        request,
        token,
        limit.reason === "limit" ? "rate_limited" : "server_error",
        { wait: String(retryAfterMinutes(limit.retryAfterSeconds)) },
      );
    }

    const query = callbackQuerySchema.safeParse({
      code: searchParams.get("code"),
      claim: searchParams.get("claim"),
    });
    if (!query.success) {
      logEvent("warn", "claim.callback_bad_query");
      return backToClaim(request, token, "callback_failed");
    }

    const supabase = await createSupabaseServerClient();
    const exchanged = await supabase.auth.exchangeCodeForSession(
      query.data.code,
    );
    const authUserId = exchanged.data.user?.id;
    if (exchanged.error || !authUserId) {
      logEvent(
        "warn",
        "claim.callback_exchange_failed",
        describeError(exchanged.error),
      );
      return backToClaim(request, query.data.claim, "callback_failed");
    }

    const claim = await claimRosterEntry(admin, {
      authUserId,
      token: query.data.claim,
    });
    if (claim.kind === "claimed") return redirectTo(request, POST_CLAIM_PATH);

    // The claim page re-reads the token's real state (used / expired /
    // revoked / unknown) and shows the matching message, so a refusal needs
    // no error param. The session is kept: the email was genuinely proven.
    if (claim.kind === "refused") {
      logEvent("info", "claim.callback_refused", {
        notice: noticeForRefusedOutcome(claim.outcome),
      });
      return backToClaim(request, query.data.claim);
    }
    return backToClaim(request, query.data.claim, "claim_failed");
  } catch (error) {
    logEvent("error", "claim.callback_failed", describeError(error));
    return backToClaim(request, token, "server_error");
  }
}
