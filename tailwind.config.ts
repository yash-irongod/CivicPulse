import type { Config } from "tailwindcss";

// Scaffold only (Task 1.1). Do not add colors, fonts, or spacing here directly:
// Task 1.5 wires this `theme.extend` block to the named tokens exported from
// lib/design/tokens.ts (Ink/Paper/Marigold/Pine/Brick + the IBM Plex type
// scale) so every component pulls from one source instead of raw hex/utility
// values. See implementation-plan.md §7 and §9 (Code Standards).
const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
