import type { MetadataRoute } from "next";

import { Ink, Paper } from "@/lib/design/tokens";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Nivas",
    short_name: "Nivas",
    description:
      "Community-operations platform for RWAs and housing societies.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    // Ink/Paper (§7.2), imported from lib/design/tokens.ts — the single
    // source of truth as of Task 1.5. Not a framework-default blue.
    background_color: Paper,
    theme_color: Ink,
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
