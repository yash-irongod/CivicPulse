import Link from "next/link";
import type { ReactElement } from "react";

import { LANG_LABELS, t } from "@/lib/i18n/claim-strings";
import { SUPPORTED_LANGS, type Lang } from "@/lib/validation/claim";

interface LanguageSwitchProps {
  current: Lang;
  basePath: string;
  /** Query params to keep when switching (for example the claim token). */
  params: Record<string, string>;
}

// Both languages are offered as equally sized controls named in their own
// script (§7.3): neither is a fallback or a secondary label. The current one
// is marked with an underline AND aria-current, not by size or weight alone.
// prefetch is off so switching language never pre-runs the token lookup.
export function LanguageSwitch({
  current,
  basePath,
  params,
}: LanguageSwitchProps): ReactElement {
  return (
    <nav aria-label={t(current, "lang_switch_label")}>
      <ul className="flex gap-2">
        {SUPPORTED_LANGS.map((lang) => {
          const query = new URLSearchParams({ ...params, lang });
          const active = lang === current;
          return (
            <li key={lang}>
              <Link
                href={`${basePath}?${query.toString()}`}
                prefetch={false}
                lang={lang}
                aria-current={active ? "true" : undefined}
                className={`inline-flex min-h-12 min-w-12 items-center justify-center px-3 text-lg font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-marigold ${
                  active
                    ? "underline decoration-marigold decoration-2 underline-offset-8"
                    : ""
                }`}
              >
                {LANG_LABELS[lang]}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
