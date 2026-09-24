// Confirmation shown after a successful claim. Reads the signed-in resident
// through the RLS-respecting cookie client, so it only ever shows what that
// user is allowed to see. Without a session, or without a resident
// membership, it sends the visitor back to the claim page instead of
// rendering an empty confirmation.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect, unstable_rethrow } from "next/navigation";
import type { ReactElement } from "react";
import { z } from "zod";

import { ClaimNotice } from "@/components/resident/claim-notice";
import { LanguageSwitch } from "@/components/resident/language-switch";
import { CLAIM_PATH, POST_CLAIM_PATH } from "@/lib/auth/claim";
import { describeError, logEvent } from "@/lib/auth/log";
import { resolveLang, t } from "@/lib/i18n/claim-strings";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { langSchema, parseClaimPageQuery } from "@/lib/validation/claim";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Nivas",
  robots: { index: false, follow: false },
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const residentRowSchema = z.object({
  id: z.guid(),
  display_name: z.string(),
  preferred_language: langSchema,
});

const membershipRowSchema = z.object({
  spaces: z.object({ name: z.string() }).nullable(),
  communities: z.object({ name: z.string() }),
});

const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold";

export default async function ClaimDonePage({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<ReactElement> {
  const query = parseClaimPageQuery(await searchParams);
  const supabase = await createSupabaseServerClient();

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) redirect(CLAIM_PATH);

  let resident: z.infer<typeof residentRowSchema>;
  let membership: z.infer<typeof membershipRowSchema>;
  try {
    // 0002's SELECT policies let a member see co-residents too, so both reads
    // are pinned to this user's own rows explicitly.
    const residentResult = await supabase
      .from("residents")
      .select("id, display_name, preferred_language")
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (residentResult.error) throw residentResult.error;
    if (residentResult.data === null) redirect(CLAIM_PATH);
    resident = residentRowSchema.parse(residentResult.data);

    const membershipResult = await supabase
      .from("memberships")
      .select("spaces(name), communities(name)")
      .eq("resident_id", resident.id)
      .eq("role", "resident")
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (membershipResult.error) throw membershipResult.error;
    if (membershipResult.data === null) redirect(CLAIM_PATH);
    membership = membershipRowSchema.parse(membershipResult.data);
  } catch (error) {
    // redirect() signals through a thrown error that must not be swallowed.
    unstable_rethrow(error);
    logEvent("error", "claim.done_failed", describeError(error));
    redirect(CLAIM_PATH);
  }

  const lang = resolveLang(query.lang, resident.preferred_language, undefined);
  const community = membership.communities.name;
  const space = membership.spaces?.name ?? null;

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
            basePath={POST_CLAIM_PATH}
            params={{}}
          />
        </div>

        <ClaimNotice
          tone="success"
          title={t(lang, "done_title", { name: resident.display_name })}
          body={
            space
              ? t(lang, "done_body_space", { community, space })
              : t(lang, "done_body", { community })
          }
        />

        <Link
          href="/"
          className={`inline-flex h-12 items-center justify-center bg-marigold px-6 text-lg font-semibold text-on-marigold ${FOCUS}`}
        >
          {t(lang, "done_action")}
        </Link>
      </main>
    </div>
  );
}
