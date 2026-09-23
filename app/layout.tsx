import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { Ink } from "@/lib/design/tokens";
import { ServiceWorkerRegistrar } from "@/lib/pwa/register";

const APP_NAME = "Nivas";
const APP_DESCRIPTION =
  "Community-operations platform for RWAs and housing societies.";

// §7.3 — self-hosted (no font CDN, §5), subset to the weights actually
// used: Thin/Regular/Medium/SemiBold/Bold. IBM Plex Sans and IBM Plex Sans
// Devanagari are loaded as two separate local fonts (each script has its
// own file) but combined into one CSS stack in lib/design/tokens.ts's
// fontFamily.sans — see that file's comment for why they're never treated
// as two separate font choices.
const plexSans = localFont({
  src: [
    {
      path: "../public/fonts/ibm-plex-sans/IBMPlexSans-Thin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans/IBMPlexSans-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans/IBMPlexSans-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans/IBMPlexSans-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans/IBMPlexSans-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  // Must exactly match fontVar.plexSans in lib/design/tokens.ts (a
  // literal is required here — see that file's comment on why).
  variable: "--font-plex-sans",
  display: "swap",
});

const plexSansDevanagari = localFont({
  src: [
    {
      path: "../public/fonts/ibm-plex-sans-devanagari/IBMPlexSansDevanagari-Thin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans-devanagari/IBMPlexSansDevanagari-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans-devanagari/IBMPlexSansDevanagari-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans-devanagari/IBMPlexSansDevanagari-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-sans-devanagari/IBMPlexSansDevanagari-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  // Must exactly match fontVar.plexSansDevanagari in lib/design/tokens.ts.
  variable: "--font-plex-sans-devanagari",
  display: "swap",
});

// §7.3 — tabular numeric data only (SLA countdowns, reference numbers in
// dense tables). Loaded globally here so it's available wherever a
// future component reaches for `font-mono`, but never applied as the
// body/document default below.
const plexMono = localFont({
  src: [
    {
      path: "../public/fonts/ibm-plex-mono/IBMPlexMono-Thin.woff2",
      weight: "100",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-mono/IBMPlexMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-mono/IBMPlexMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-mono/IBMPlexMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../public/fonts/ibm-plex-mono/IBMPlexMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  // Must exactly match fontVar.plexMono in lib/design/tokens.ts.
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_NAME,
  description: APP_DESCRIPTION,
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: APP_NAME,
  },
  formatDetection: {
    telephone: false,
  },
  // app/manifest.ts is a Next.js metadata-file convention — the
  // <link rel="manifest"> tag is inserted automatically, nothing to wire
  // up here.
};

export const viewport: Viewport = {
  // Ink (§7.2) — imported from lib/design/tokens.ts, the single source of
  // truth as of Task 1.5. Not a framework-default blue.
  themeColor: Ink,
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${plexSans.variable} ${plexSansDevanagari.variable} ${plexMono.variable} antialiased`}
      >
        <ServiceWorkerRegistrar />
        {children}
      </body>
    </html>
  );
}
