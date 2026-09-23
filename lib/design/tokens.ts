/**
 * §7.2 — five named colors, each with exactly one job. This is the single
 * source of truth §9 Code Standards require: no hex literal for any of
 * these should appear anywhere else in the codebase. tailwind.config.ts
 * extends Tailwind's theme from this file; a component needing a raw
 * value (rather than a bg-, text-, or border- utility) imports from here
 * too — never a literal.
 */
export const Ink = "#151C2C"; // primary text, dark surfaces
export const Paper = "#F4F5F2"; // canvas — cool-neutral, never warm cream
export const Marigold = "#9C6212"; // the one accent; also the active/needs-attention severity signal
export const Pine = "#1F6F5C"; // resolved / healthy signal
export const Brick = "#B3432B"; // critical severity ONLY — never decorative

const White = "#FFFFFF";

export const colors = {
  ink: Ink,
  paper: Paper,
  marigold: Marigold,
  pine: Pine,
  brick: Brick,
} as const;

export type ColorToken = keyof typeof colors;

/**
 * §7.7 — on any fill of Marigold, Pine, or Brick (a button, a filled
 * badge), the text/icon on top is white, never Ink: Ink-on-signal-color
 * fails WCAG AA in all three cases; white-on-signal-color clears it
 * comfortably (5.0–6.0:1) in all three. Exported as its own mapping so a
 * filled component pulls its text color from the same source as its
 * background — structural, not something every future component has to
 * remember from prose.
 */
export const onFill = {
  onMarigold: White,
  onPine: White,
  onBrick: White,
} as const;

/**
 * CSS custom-property names next/font/local (wired in app/layout.tsx)
 * binds each self-hosted family to. Documented here as the canonical
 * names — but next/font/local's `variable` option is a compiler macro
 * that requires an explicitly written string literal at each call site,
 * not a reference to this object, so app/layout.tsx repeats these three
 * strings as literals rather than importing them. If you change a name
 * here, update app/layout.tsx's matching localFont() call too.
 */
export const fontVar = {
  plexSans: "--font-plex-sans",
  plexSansDevanagari: "--font-plex-sans-devanagari",
  plexMono: "--font-plex-mono",
} as const;

/**
 * §7.3 — IBM Plex Sans and IBM Plex Sans Devanagari are listed together
 * in one stack, Latin family first, so English text renders in Plex Sans
 * and Hindi text falls back per-character to Plex Sans Devanagari: same
 * design team, same design language across both scripts, so the two read
 * as equally weighted rather than a mismatched second-language
 * afterthought. Verified for real at Task 1.5 time by rendering both
 * families' actual glyphs side by side at Regular and Bold — not just
 * assumed from the vendor's claim. The two families are never offered as
 * separate/alternative font choices anywhere in the app.
 */
export const fontFamily = {
  sans: `var(${fontVar.plexSans}), var(${fontVar.plexSansDevanagari}), ui-sans-serif, system-ui, sans-serif`,
  // §7.3 — tabular numeric data only (SLA countdowns, reference numbers
  // in dense tables); never a decorative label treatment.
  mono: `var(${fontVar.plexMono}), ui-monospace, "SFMono-Regular", monospace`,
} as const;
