import fs from "node:fs";
import path from "node:path";

export type NivasAssetName =
  | "logo.svg"
  | "logo-wordmark.svg"
  | "hero-illustration.webp"
  | "empty-reports.webp"
  | "empty-notifications.webp"
  | "step-report.webp"
  | "step-assign.webp"
  | "step-verify.webp"
  | "resident-welcome-poster.jpg";

export interface ResolvedAssets {
  logo: string | null;
  logoWordmark: string | null;
  heroIllustration: string | null;
  emptyReports: string | null;
  emptyNotifications: string | null;
  stepReport: string | null;
  stepAssign: string | null;
  stepVerify: string | null;
  residentWelcomePoster: string | null;
}

/**
 * Resolves optional user-supplied assets cleanly on the server without causing 404s.
 * Priority:
 * 1. `public/assets/<name>` -> served statically at `/assets/<name>`
 * 2. `assets/raw/<name>`    -> served dynamically via `/api/assets/<name>` (immediate hot-drop)
 * 3. `null`                 -> component falls back gracefully to vector/SVG UI
 */
export function resolveAssetUrl(filename: NivasAssetName): string | null {
  const publicPath = path.join(process.cwd(), "public", "assets", filename);
  if (fs.existsSync(publicPath)) {
    return `/assets/${filename}`;
  }

  const rawPath = path.join(process.cwd(), "assets", "raw", filename);
  if (fs.existsSync(rawPath)) {
    return `/api/assets/${filename}`;
  }

  return null;
}

export function getResolvedAssets(): ResolvedAssets {
  return {
    logo: resolveAssetUrl("logo.svg"),
    logoWordmark: resolveAssetUrl("logo-wordmark.svg"),
    heroIllustration: resolveAssetUrl("hero-illustration.webp"),
    emptyReports: resolveAssetUrl("empty-reports.webp"),
    emptyNotifications: resolveAssetUrl("empty-notifications.webp"),
    stepReport: resolveAssetUrl("step-report.webp"),
    stepAssign: resolveAssetUrl("step-assign.webp"),
    stepVerify: resolveAssetUrl("step-verify.webp"),
    residentWelcomePoster: resolveAssetUrl("resident-welcome-poster.jpg"),
  };
}
