"use client";

import { useActionState, type ReactElement } from "react";

import { claimWithoutEmail, requestClaimLink } from "@/app/auth/claim/actions";
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
const SECONDARY_BUTTON = `h-12 w-full border-2 border-ink bg-paper px-6 text-lg font-semibold text-ink disabled:cursor-wait disabled:opacity-70 ${FOCUS}`;

export function ClaimForm({
  token,
  lang,
  displayName,
  communityName,
  spaceName,
  initialNotice,
}: ClaimFormProps): ReactElement {
  const [emailState, emailAction, emailPending] = useActionState(
    requestClaimLink,
    IDLE,
  );
  const [noEmailState, noEmailAction, noEmailPending] = useActionState(
    claimWithoutEmail,
    IDLE,
  );

  const busy = emailPending || noEmailPending;
  const failed =
    noEmailState.status === "error"
      ? noEmailState
      : emailState.status === "error"
        ? emailState
        : null;
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

      {emailState.status === "link_sent" ? (
        <div className="flex flex-col gap-4">
          <ClaimNotice
            tone="success"
            title={t(lang, "sent_title")}
            body={t(lang, "sent_body", { email: emailState.email })}
          />
          {/* A plain link back to the same page: a fresh load is the simplest
              honest way to reset the form, and works without JavaScript. */}
          <a
            href={`/auth/claim?${new URLSearchParams({ token, lang }).toString()}`}
            className={`inline-flex min-h-12 items-center text-lg font-medium underline underline-offset-4 ${FOCUS}`}
          >
            {t(lang, "sent_change_email")}
          </a>
        </div>
      ) : (
        <form action={emailAction} className="flex flex-col gap-4">
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lang" value={lang} />
          <div className="flex flex-col gap-2">
            <label htmlFor="claim-email" className="text-lg font-medium">
              {t(lang, "email_label")}
            </label>
            <input
              id="claim-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-describedby="claim-email-help"
              className={`h-12 w-full border-2 border-ink bg-paper px-3 text-lg text-ink ${FOCUS}`}
            />
            <p id="claim-email-help" className="text-base leading-relaxed">
              {t(lang, "email_help")}
            </p>
          </div>
          <button type="submit" disabled={busy} className={PRIMARY_BUTTON}>
            {emailPending ? t(lang, "sending") : t(lang, "send_link")}
          </button>
        </form>
      )}

      <section aria-labelledby="claim-no-email" className="flex flex-col gap-3">
        <h2 id="claim-no-email" className="text-xl font-medium">
          {t(lang, "no_email_title")}
        </h2>
        <p className="text-base leading-relaxed">{t(lang, "no_email_body")}</p>
        <form action={noEmailAction}>
          <input type="hidden" name="token" value={token} />
          <input type="hidden" name="lang" value={lang} />
          <button type="submit" disabled={busy} className={SECONDARY_BUTTON}>
            {noEmailPending ? t(lang, "joining") : t(lang, "no_email_button")}
          </button>
        </form>
      </section>
    </div>
  );
}
