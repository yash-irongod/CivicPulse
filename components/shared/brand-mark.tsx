import React from "react";

interface BrandMarkProps {
  /** Optional URL to user-provided SVG from assets/raw/logo.svg */
  logoUrl?: string | null;
  variant?: "dark" | "light" | "marigold";
  size?: "sm" | "md";
}

/**
 * Architectural Nivas monogram mark.
 * Uses user-provided `logo.svg` when available, otherwise renders a crisp
 * geometric N + doorway threshold mark in exact Nivas design tokens.
 */
export function BrandMark({
  logoUrl,
  variant = "dark",
  size = "md",
}: BrandMarkProps) {
  const boxSize = size === "sm" ? "w-7 h-7 rounded-lg" : "w-8 h-8 rounded-lg";
  const palette =
    variant === "marigold"
      ? "bg-marigold text-on-marigold"
      : variant === "light"
        ? "bg-paper text-ink"
        : "bg-ink text-paper";

  if (logoUrl) {
    return (
      <div
        className={`${boxSize} ${palette} flex items-center justify-center p-1.5 overflow-hidden shrink-0`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoUrl}
          alt="Nivas"
          className="w-full h-full object-contain"
        />
      </div>
    );
  }

  return (
    <div
      className={`${boxSize} ${palette} flex items-center justify-center shrink-0`}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className={size === "sm" ? "w-4 h-4" : "w-[18px] h-[18px]"}
      >
        {/* Architectural arch threshold + clean 'N' pillars */}
        <path
          d="M5 19V6.5C5 5.67 5.67 5 6.5 5H7.2C7.72 5 8.21 5.27 8.48 5.71L15.52 17.29C15.79 17.73 16.28 18 16.8 18H17.5C18.33 18 19 17.33 19 16.5V5"
          stroke="currentColor"
          strokeWidth="2.1"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="19" cy="19" r="1.4" fill="currentColor" />
      </svg>
    </div>
  );
}
