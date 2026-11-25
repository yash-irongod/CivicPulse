"use client";

import { useActionState, type ReactElement } from "react";

import { claimWithoutEmail } from "@/app/auth/claim/actions";
import { ClaimNotice } from "@/components/resident/claim-notice";
import { noticeBody, noticeTitle, t } from "@/lib/i18n/claim-strings";
import type {
  ClaimFormState,
  ClaimNoticeCode,
  Lang,
} from "@/lib/validation/claim";

interface ClaimFormProps {
  token: string;
  lang: Lang;
  displayName: string;
  communityName: string;
  spaceName: string | null;
  /** A notice handed back by /auth/callback via ?error=, if any. */
  initialNotice: { code: ClaimNoticeCode; minutes?: number } | null;
}

const IDLE: ClaimFormState = { status: "idle" };

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold";

// Thumb-sized: 48px minimum height on every control (§7.7). No tracking
// utilities anywhere in this file: they break the Devanagari shirorekha.
const PRIMARY_BUTTON = `h-12 w-full bg-marigold px-6 text-lg font-semibold text-on-marigold disabled:cursor-wait disabled:opacity-70 ${FOCUS}`;

export function ClaimForm({
  token,
  lang,
  displayName,
  communityName,
  spaceName,
  initialNotice,
}: ClaimFormProps): ReactElement {
  const [joinState, joinAction, joinPending] = useActionState(
    claimWithoutEmail,
    IDLE,
  );

  const failed = joinState.status === "error" ? joinState : null;
  const notice = failed
    ? { code: failed.code, minutes: failed.retryAfterMinutes }
    : initialNotice;
  const params = { minutes: notice?.minutes ?? 10 };

  const welcomeBody = spaceName
    ? t(lang, "welcome_body_space", {
        community: communityName,
        space: spaceName,
      })
    : t(lang, "welcome_body", { community: communityName });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-3xl font-medium leading-tight">
          {t(lang, "welcome_title", { name: displayName })}
        </h1>
        <p className="mt-3 text-lg leading-relaxed">{welcomeBody}</p>
      </header>

      {notice ? (
        <ClaimNotice
          tone="attention"
          title={noticeTitle(lang, notice.code, params)}
          body={noticeBody(lang, notice.code, params)}
        />
      ) : null}

      <form action={joinAction} className="flex flex-col gap-4">
        <input type="hidden" name="token" value={token} />
        <input type="hidden" name="lang" value={lang} />
        <p className="text-base leading-relaxed">{t(lang, "no_email_body")}</p>
        <button type="submit" disabled={joinPending} className={PRIMARY_BUTTON}>
          {joinPending ? t(lang, "joining") : t(lang, "no_email_button")}
        </button>
      </form>
    </div>
  );
}
