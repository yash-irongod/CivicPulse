import type { Config } from "tailwindcss";

import { colors, fontFamily, onFill } from "./lib/design/tokens";

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
        "on-marigold": onFill.onMarigold,
        "on-pine": onFill.onPine,
        "on-brick": onFill.onBrick,
      },
      fontFamily: {
        sans: [fontFamily.sans],
        mono: [fontFamily.mono],
      },
      borderRadius: {
        DEFAULT: "0.625rem", // 10px — the one radius
        sm: "0.375rem",
        md: "0.625rem",
        lg: "0.875rem",
        xl: "1.25rem",
      },
      boxShadow: {
        soft: "0 1px 3px rgba(21,28,44,0.06), 0 1px 2px rgba(21,28,44,0.04)",
        card: "0 4px 12px rgba(21,28,44,0.06), 0 1px 3px rgba(21,28,44,0.04)",
        elevated:
          "0 8px 24px rgba(21,28,44,0.08), 0 2px 8px rgba(21,28,44,0.04)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(16px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.95)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.4s ease-out both",
        "slide-in-right": "slide-in-right 0.3s ease-out both",
        "scale-in": "scale-in 0.2s ease-out both",
        shimmer: "shimmer 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
