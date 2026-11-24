import fs from "node:fs";
import path from "node:path";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

const ALLOWED_FILENAMES = new Set([
  "logo.svg",
  "logo-wordmark.svg",
  "hero-illustration.webp",
  "empty-reports.webp",
  "empty-notifications.webp",
  "step-report.webp",
  "step-assign.webp",
  "step-verify.webp",
]);

type RouteContext = { params: Promise<{ filename: string }> };

export async function GET(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { filename } = await params;

  if (!ALLOWED_FILENAMES.has(filename)) {
    return new NextResponse("Not found", { status: 404 });
  }

  const publicPath = path.join(process.cwd(), "public", "assets", filename);
  const rawPath = path.join(process.cwd(), "assets", "raw", filename);
  const target = fs.existsSync(publicPath)
    ? publicPath
    : fs.existsSync(rawPath)
      ? rawPath
      : null;

  if (!target) {
    return new NextResponse("Not found", { status: 404 });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
  const buffer = fs.readFileSync(target);

  return new NextResponse(buffer, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600",
    },
  });
}
