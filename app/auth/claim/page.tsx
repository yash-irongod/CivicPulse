// The resident claim page (Task 3.1). The page is reached through the
// one-time link the committee hands out: /auth/claim?token=<64 hex>.
//
// Nothing is rendered about a roster entry until its token has been checked,
// and every "does not work" state (absent, malformed, unknown) reads the same
// to the visitor, so the page cannot be used to probe which tokens exist.

import type { Metadata } from "next";
import { headers } from "next/headers";
import type { ReactElement } from "react";

import { ClaimForm } from "@/components/resident/claim-form";
import { ClaimNotice } from "@/components/resident/claim-notice";
import { LanguageSwitch } from "@/components/resident/language-switch";
import {
  CLAIM_LIMITS,
  CLAIM_PATH,
  lookupClaimEntry,
  type ClaimEntryView,
} from "@/lib/auth/claim";
import {
  classifyClaimEntry,
  noticeForEntryState,
} from "@/lib/auth/claim-token";
import {
  enforceRateLimits,
  getClientIp,
  retryAfterMinutes,
} from "@/lib/auth/rate-limit";
import { describeError, logEvent } from "@/lib/auth/log";
import {
  noticeBody,
  noticeTitle,
  resolveLang,
  t,
} from "@/lib/i18n/claim-strings";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import {
  claimTokenSchema,
  parseClaimPageQuery,
  type ClaimNoticeCode,
  type ClaimPageQuery,
} from "@/lib/validation/claim";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const query = parseClaimPageQuery(await searchParams);
  return {
    title: t(query.lang ?? "en", "doc_title"),
    // The URL carries a bearer token: keep it out of search indexes and out
    // of Referer headers.
    robots: { index: false, follow: false },
    referrer: "no-referrer",
  };
}

type View =
  | { kind: "notice"; code: ClaimNoticeCode; minutes?: number }
  | { kind: "form"; token: string; entry: ClaimEntryView };

async function resolveView(query: ClaimPageQuery): Promise<View> {
  if (query.token === undefined)
    return { kind: "notice", code: "link_missing" };

  const token = claimTokenSchema.safeParse(query.token);
  if (!token.success) return { kind: "notice", code: "link_invalid" };

  try {
    const admin = createSupabaseServiceRoleClient();
    const limit = await enforceRateLimits(admin, [
      {
        spec: CLAIM_LIMITS.pageViewIp,
        identifier: getClientIp(await headers()),
      },
    ]);
    if (!limit.allowed) {
      return {
        kind: "notice",
        code: limit.reason === "limit" ? "rate_limited" : "server_error",
        minutes: retryAfterMinutes(limit.retryAfterSeconds),
      };
    }

    const lookup = await lookupClaimEntry(admin, token.data);
    if (lookup.kind === "error")
      return { kind: "notice", code: "server_error" };
    if (lookup.kind === "not_found")
      return { kind: "notice", code: "link_invalid" };

    const state = classifyClaimEntry(lookup.entry, new Date());
    if (state !== "claimable") {
      return { kind: "notice", code: noticeForEntryState(state) };
    }
    return { kind: "form", token: token.data, entry: lookup.entry };
  } catch (error) {
    logEvent("error", "claim.page_failed", describeError(error));
    return { kind: "notice", code: "server_error" };
  }
}

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const query = parseClaimPageQuery(await searchParams);
  const view = await resolveView(query);

  const lang =
    view.kind === "form"
      ? resolveLang(
          query.lang,
          view.entry.preferredLanguage,
          view.entry.communityDefaultLanguage,
        )
      : resolveLang(query.lang, undefined, undefined);

  const switchParams: Record<string, string> = {};
  if (query.token !== undefined) switchParams.token = query.token;

  return (
    <div className="min-h-dvh bg-paper font-sans text-ink">
      <main
        lang={lang}
        className="mx-auto flex max-w-md flex-col gap-8 px-6 py-6"
      >
        <div className="flex items-center justify-between">
          <span className="text-xl font-semibold">Nivas</span>
          <LanguageSwitch
            current={lang}
            basePath={CLAIM_PATH}
            params={switchParams}
          />
        </div>

        {view.kind === "form" ? (
          <ClaimForm
            token={view.token}
            lang={lang}
            displayName={view.entry.displayName}
            communityName={view.entry.communityName}
            spaceName={view.entry.spaceName}
            initialNotice={
              query.error
                ? { code: query.error, minutes: query.waitMinutes }
                : null
            }
          />
        ) : (
          <ClaimNotice
            tone="attention"
            title={noticeTitle(lang, view.code, {
              minutes: view.minutes ?? 10,
            })}
            body={noticeBody(lang, view.code, { minutes: view.minutes ?? 10 })}
          />
        )}
      </main>
    </div>
  );
}
