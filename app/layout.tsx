import type { Metadata } from "next";
import "./globals.css";

// No font is loaded here yet. §5 of the plan rules out any font CDN
// (Google Fonts included) — Task 1.5 self-hosts IBM Plex Sans, IBM Plex
// Sans Devanagari, and IBM Plex Mono as local webfonts and wires them into
// this layout via next/font/local + the tokens in lib/design/tokens.ts.

export const metadata: Metadata = {
  title: "Nivas",
  description: "Community-operations platform for RWAs and housing societies.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
