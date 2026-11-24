// POST /api/issues/[id]/classify — Run AI classification on an issue (Task 5.1, Task 8.2).
// Returns the AI's category recommendation, severity, confidence, and reasoning.

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { classifyIssue } from "@/lib/ai/classify";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(
  _request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: issueId } = await params;

  if (!z.guid().safeParse(issueId).success) {
    return json({ error: "not_found" }, 404);
  }

  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(
      ["resident", "committee_admin", "maintenance_staff"],
      db,
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "issue_classify.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  // 1. Fetch issue details
  const { data: issue, error: issueError } = await db
    .from("issues")
    .select("id, community_id, raw_text, raw_transcript, photo_paths")
    .eq("id", issueId)
    .maybeSingle();

  if (issueError || !issue) {
    return json({ error: "issue_not_found" }, 404);
  }

  if (issue.community_id !== session.activeCommunityId) {
    return json({ error: "forbidden" }, 403);
  }

  // 2. Fetch available categories for community
  const { data: categories, error: catError } = await db
    .from("categories")
    .select("id, name")
    .eq("community_id", session.activeCommunityId)
    .eq("is_active", true);

  if (catError || !categories || categories.length === 0) {
    return json({ error: "no_categories" }, 400);
  }

  // 3. Optional photo retrieval for multimodal classification
  let photoBase64: string | null = null;
  let photoMimeType: string | null = null;

  if (issue.photo_paths && issue.photo_paths.length > 0) {
    const firstPath = issue.photo_paths[0];
    if (
      typeof firstPath === "string" &&
      firstPath.startsWith(`${session.activeCommunityId}/`)
    ) {
      try {
        const admin = createSupabaseServiceRoleClient();
        const { data: blob, error: downloadError } = await admin.storage
          .from("evidence-photos")
          .download(firstPath);

        if (downloadError) {
          logEvent(
            "warn",
            "issue_classify.photo_download_failed",
            describeError(downloadError),
          );
        } else if (blob) {
          const buffer = await blob.arrayBuffer();
          photoBase64 = Buffer.from(buffer).toString("base64");
          photoMimeType = blob.type || "image/jpeg";
        }
      } catch (err) {
        logEvent(
          "warn",
          "issue_classify.photo_download_failed",
          describeError(err),
        );
      }
    }
  }

  // 4. Run classification
  const result = await classifyIssue({
    text: issue.raw_text,
    transcript: issue.raw_transcript,
    photoBase64,
    photoMimeType,
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
  });

  const matchingCategory = categories.find((c) => c.id === result.categoryId);

  return json(
    {
      issueId,
      classification: {
        categoryId: result.categoryId,
        categoryName: matchingCategory?.name ?? null,
        severity: result.severity,
        confidence: result.confidence,
        reasoning: result.reasoning,
        needsHumanTriage: result.needsHumanTriage,
      },
    },
    200,
  );
}
