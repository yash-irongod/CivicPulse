import type { Config } from "tailwindcss";

import { colors, fontFamily, onFill } from "./lib/design/tokens";

// theme.extend below reads its colors and font stacks from
// lib/design/tokens.ts (§7, §9 Code Standards) — the single source of
// truth. Don't add a color, hex value, or font-family string directly
// here; add it to tokens.ts and reference it, same as everything else.
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: colors.ink,
        paper: colors.paper,
        marigold: colors.marigold,
        pine: colors.pine,
        brick: colors.brick,
        // §7.7's verified fill/text pairing (lib/design/tokens.ts's
        // onFill) as its own utilities — e.g. `bg-marigold text-on-marigold`
        // pulls a button's text color from the same source as its fill.
        "on-marigold": onFill.onMarigold,
        "on-pine": onFill.onPine,
        "on-brick": onFill.onBrick,
      },
      fontFamily: {
        // Each is a single precomposed stack (see tokens.ts) rather than
        // an array Tailwind reassembles, so the Latin-then-Devanagari
        // fallback order from §7.3 can't be accidentally reordered here.
        sans: [fontFamily.sans],
        mono: [fontFamily.mono],
      },
    },
  },
  plugins: [],
};

export default config;
