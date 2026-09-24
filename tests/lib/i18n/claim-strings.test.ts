import { describe, expect, it } from "vitest";

import {
  CLAIM_STRINGS,
  LANG_LABELS,
  noticeBody,
  noticeTitle,
  resolveLang,
  t,
  type ClaimStringKey,
} from "../../../lib/i18n/claim-strings";
import {
  CLAIM_NOTICE_CODES,
  SUPPORTED_LANGS,
} from "../../../lib/validation/claim";

const DEVANAGARI = /[\u0900-\u097F]/;
const PLACEHOLDERS = /\{(\w+)\}/g;
const keys = Object.keys(CLAIM_STRINGS.en) as ClaimStringKey[];

function placeholders(text: string): string[] {
  return [...text.matchAll(PLACEHOLDERS)].map((m) => m[1] ?? "").sort();
}

describe("claim strings", () => {
  it("has exactly the same keys in both languages", () => {
    expect(Object.keys(CLAIM_STRINGS.hi).sort()).toEqual([...keys].sort());
  });

  it("has a title and a body for every notice code in every language", () => {
    for (const lang of SUPPORTED_LANGS) {
      for (const code of CLAIM_NOTICE_CODES) {
        expect(noticeTitle(lang, code).length).toBeGreaterThan(0);
        expect(noticeBody(lang, code).length).toBeGreaterThan(0);
      }
    }
  });

  it.each(keys)("uses the same placeholders in both languages: %s", (key) => {
    expect(placeholders(CLAIM_STRINGS.hi[key])).toEqual(
      placeholders(CLAIM_STRINGS.en[key]),
    );
  });

  it.each(keys)("Hindi string is really Hindi: %s", (key) => {
    expect(CLAIM_STRINGS.hi[key]).toMatch(DEVANAGARI);
  });

  it.each(keys)(
    "English string has no Devanagari and no all-caps word: %s",
    (key) => {
      expect(CLAIM_STRINGS.en[key]).not.toMatch(DEVANAGARI);
      expect(CLAIM_STRINGS.en[key]).not.toMatch(/\b[A-Z]{3,}\b/);
    },
  );

  it.each(keys)("no string is empty, padded or apologetic: %s", (key) => {
    for (const lang of SUPPORTED_LANGS) {
      const text = CLAIM_STRINGS[lang][key];
      expect(text).toBe(text.trim());
      expect(text.length).toBeGreaterThan(0);
    }
    expect(CLAIM_STRINGS.en[key].toLowerCase()).not.toMatch(
      /\b(sorry|oops|unfortunately)\b/,
    );
  });

  it("names each language in its own script", () => {
    expect(LANG_LABELS.en).toBe("English");
    expect(LANG_LABELS.hi).toMatch(DEVANAGARI);
  });
});

describe("t", () => {
  it("fills placeholders in both languages", () => {
    expect(t("en", "welcome_title", { name: "Asha" })).toBe("Welcome, Asha");
    expect(t("hi", "welcome_title", { name: "आशा" })).toBe("स्वागत है, आशा");
  });

  it("fills numeric params", () => {
    expect(t("en", "rate_limited_body", { minutes: 5 })).toBe(
      "Try again in 5 min.",
    );
  });

  it("leaves a missing placeholder visible instead of dropping it", () => {
    expect(t("en", "welcome_title")).toBe("Welcome, {name}");
  });

  it("does not treat user-supplied text as a template", () => {
    expect(t("en", "welcome_title", { name: "{community}" })).toBe(
      "Welcome, {community}",
    );
  });
});

describe("resolveLang", () => {
  it("prefers explicit, then the entry, then the community, then English", () => {
    expect(resolveLang("hi", "en", "en")).toBe("hi");
    expect(resolveLang(undefined, "hi", "en")).toBe("hi");
    expect(resolveLang(undefined, undefined, "hi")).toBe("hi");
    expect(resolveLang(undefined, undefined, undefined)).toBe("en");
  });
});
