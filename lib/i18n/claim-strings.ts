// Bilingual strings for the claim flow (§6.8, §7.3, §7.6).
//
// One language is shown at a time, chosen from the roster entry's
// preferred_language (then the community default) and switchable with equally
// sized controls. Hindi is therefore never a smaller or parenthetical line
// under the English: each language gets the full, identical layout.
//
// Rules for anyone editing this file:
//  - Same {placeholders} in both languages (tests/lib/i18n enforces it).
//  - Plain, active, specific; no apology or hedging.
//  - Sentence case. No all-caps, and never apply tracking to Devanagari.

import type { ClaimNoticeCode, Lang } from "../validation/claim";

type NoticeKey = `${ClaimNoticeCode}_title` | `${ClaimNoticeCode}_body`;

type PlainKey =
  | "doc_title"
  | "lang_switch_label"
  | "welcome_title"
  | "welcome_body_space"
  | "welcome_body"
  | "email_label"
  | "email_help"
  | "send_link"
  | "sending"
  | "no_email_title"
  | "no_email_body"
  | "no_email_button"
  | "joining"
  | "sent_title"
  | "sent_body"
  | "sent_change_email"
  | "done_title"
  | "done_body_space"
  | "done_body"
  | "done_action";

export type ClaimStringKey = PlainKey | NoticeKey;
type Dictionary = Record<ClaimStringKey, string>;

const en: Dictionary = {
  doc_title: "Join Nivas",
  lang_switch_label: "Language",
  welcome_title: "Welcome, {name}",
  welcome_body_space:
    "{community} has added you at {space}. Confirm below to start reporting problems.",
  welcome_body:
    "{community} has added you. Confirm below to start reporting problems.",
  email_label: "Your email address",
  email_help:
    "We will send a sign-in link to this address. Open it on this phone.",
  send_link: "Send sign-in link",
  sending: "Sending link",
  no_email_title: "No email address?",
  no_email_body:
    "You can join without one. You will stay signed in on this phone only. If you lose access, ask whoever gave you this link for a new one.",
  no_email_button: "Join without email",
  joining: "Joining",
  sent_title: "Check your email",
  sent_body:
    "We sent a sign-in link to {email}. Open it on this phone to finish joining. The link works once.",
  sent_change_email: "Use a different email",
  done_title: "You are in, {name}",
  done_body_space: "You now belong to {community} at {space}.",
  done_body: "You now belong to {community}.",
  done_action: "Open Nivas",

  link_missing_title: "This page needs your link",
  link_missing_body:
    "Open the link you were given, or ask whoever gave it to you for a new one.",
  link_invalid_title: "This link does not work",
  link_invalid_body:
    "The link is incomplete or was changed. Ask for a new one.",
  link_used_title: "This link was already used",
  link_used_body:
    "If you already joined, open Nivas on the phone you joined with. Otherwise ask for a new link.",
  link_expired_title: "This link has expired",
  link_expired_body: "Ask for a new link.",
  link_revoked_title: "This link was cancelled",
  link_revoked_body: "Ask for a new link if you think this is a mistake.",
  rate_limited_title: "Too many attempts",
  rate_limited_body: "Try again in {minutes} min.",
  server_error_title: "Something went wrong on our side",
  server_error_body: "Nothing was saved. Try again in a minute.",
  email_invalid_title: "Check the email address",
  email_invalid_body: "Enter an address like name@example.com.",
  send_failed_title: "The link was not sent",
  send_failed_body: "Check the address and try again in a minute.",
  claim_failed_title: "Joining did not finish",
  claim_failed_body: "Your link is still valid. Try again.",
  callback_failed_title: "The sign-in link did not work",
  callback_failed_body:
    "Open it on the same phone and browser where you asked for it, or send a new link below.",
};

const hi: Dictionary = {
  doc_title: "Nivas से जुड़ें",
  lang_switch_label: "भाषा",
  welcome_title: "स्वागत है, {name}",
  welcome_body_space:
    "{community} ने आपको {space} में जोड़ा है। समस्याएँ दर्ज करना शुरू करने के लिए नीचे पुष्टि करें।",
  welcome_body:
    "{community} ने आपको जोड़ा है। समस्याएँ दर्ज करना शुरू करने के लिए नीचे पुष्टि करें।",
  email_label: "आपका ईमेल पता",
  email_help: "हम इस पते पर साइन-इन लिंक भेजेंगे। उसे इसी फ़ोन पर खोलें।",
  send_link: "साइन-इन लिंक भेजें",
  sending: "लिंक भेजा जा रहा है",
  no_email_title: "ईमेल पता नहीं है?",
  no_email_body:
    "आप बिना ईमेल के भी जुड़ सकते हैं। आप सिर्फ़ इसी फ़ोन पर साइन-इन रहेंगे। पहुँच खो जाए तो जिसने आपको यह लिंक दिया उससे नया लिंक माँगें।",
  no_email_button: "बिना ईमेल के जुड़ें",
  joining: "जोड़ा जा रहा है",
  sent_title: "अपना ईमेल देखें",
  sent_body:
    "हमने {email} पर साइन-इन लिंक भेजा है। जुड़ना पूरा करने के लिए उसे इसी फ़ोन पर खोलें। लिंक सिर्फ़ एक बार काम करता है।",
  sent_change_email: "दूसरा ईमेल इस्तेमाल करें",
  done_title: "आप जुड़ गए, {name}",
  done_body_space: "अब आप {community} में {space} से जुड़े हैं।",
  done_body: "अब आप {community} से जुड़े हैं।",
  done_action: "Nivas खोलें",

  link_missing_title: "इस पेज के लिए आपका लिंक चाहिए",
  link_missing_body:
    "आपको जो लिंक दिया गया था उसे खोलें, या जिसने दिया उससे नया लिंक माँगें।",
  link_invalid_title: "यह लिंक काम नहीं कर रहा",
  link_invalid_body: "लिंक अधूरा है या बदल गया है। नया लिंक माँगें।",
  link_used_title: "यह लिंक पहले ही इस्तेमाल हो चुका है",
  link_used_body:
    "अगर आप जुड़ चुके हैं, तो जिस फ़ोन से जुड़े थे उसी पर Nivas खोलें। नहीं तो नया लिंक माँगें।",
  link_expired_title: "यह लिंक समाप्त हो चुका है",
  link_expired_body: "नया लिंक माँगें।",
  link_revoked_title: "यह लिंक रद्द कर दिया गया है",
  link_revoked_body: "अगर आपको लगता है कि यह गलती है, तो नया लिंक माँगें।",
  rate_limited_title: "बहुत ज़्यादा प्रयास हुए",
  rate_limited_body: "{minutes} मिनट बाद फिर कोशिश करें।",
  server_error_title: "हमारी तरफ़ से कुछ गड़बड़ हुई",
  server_error_body: "कुछ भी सहेजा नहीं गया। एक मिनट बाद फिर कोशिश करें।",
  email_invalid_title: "ईमेल पता जाँचें",
  email_invalid_body: "name@example.com जैसा पता लिखें।",
  send_failed_title: "लिंक नहीं भेजा जा सका",
  send_failed_body: "पता जाँचें और एक मिनट बाद फिर कोशिश करें।",
  claim_failed_title: "जुड़ना पूरा नहीं हुआ",
  claim_failed_body: "आपका लिंक अभी भी चालू है। फिर कोशिश करें।",
  callback_failed_title: "साइन-इन लिंक काम नहीं किया",
  callback_failed_body:
    "उसे उसी फ़ोन और ब्राउज़र में खोलें जिसमें आपने माँगा था, या नीचे से नया लिंक भेजें।",
};

export const CLAIM_STRINGS: Record<Lang, Dictionary> = { en, hi };

/** Each language named in its own script, at equal size wherever shown. */
export const LANG_LABELS: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
};

export type StringParams = Record<string, string | number>;

const PLACEHOLDER = /\{(\w+)\}/g;

/** A placeholder with no matching param is left visible, never silently dropped. */
export function t(
  lang: Lang,
  key: ClaimStringKey,
  params: StringParams = {},
): string {
  return CLAIM_STRINGS[lang][key].replace(
    PLACEHOLDER,
    (match, name: string) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    },
  );
}

export function noticeTitle(
  lang: Lang,
  code: ClaimNoticeCode,
  params: StringParams = {},
): string {
  return t(lang, `${code}_title`, params);
}

export function noticeBody(
  lang: Lang,
  code: ClaimNoticeCode,
  params: StringParams = {},
): string {
  return t(lang, `${code}_body`, params);
}

/**
 * An explicit, valid `?lang=` wins; otherwise the roster entry's language;
 * otherwise the community default; otherwise English.
 */
export function resolveLang(
  explicit: Lang | undefined,
  entryLang: Lang | undefined,
  communityDefault: Lang | undefined,
): Lang {
  return explicit ?? entryLang ?? communityDefault ?? "en";
}
