// POST /api/issues — Issue Submission API (Task 4.1, §6.4, §6.9, §9).
// Accepts multipart form data with text, photos, voice note, and GPS coordinates.
// Scoped to the caller's community (derived from authenticated session, never client-trusted).
// Rate-limited per resident (10 submissions/hour).

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { checkRateLimit, type LimitSpec } from "@/lib/auth/rate-limit";
import { consolidateDefault } from "@/lib/lifecycle/consolidate";
import {
  createSupabaseServerClient,
  createSupabaseServiceRoleClient,
} from "@/lib/supabase/server";
import {
  ALLOWED_PHOTO_MIME_TYPES,
  ALLOWED_VOICE_MIME_TYPES,
  MAX_PHOTO_COUNT,
  MAX_PHOTO_SIZE_BYTES,
  MAX_VOICE_SIZE_BYTES,
  issueSubmissionInputSchema,
} from "@/lib/validation/issue";

export const dynamic = "force-dynamic";

const ISSUE_RATE_LIMIT: LimitSpec = {
  bucket: "issue_submission_resident",
  limit: 10,
  windowSeconds: 3600, // 10 submissions per hour per resident
};

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function POST(request: NextRequest): Promise<Response> {
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
    logEvent("error", "issue.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  // Rate limiting check
  let admin;
  try {
    admin = createSupabaseServiceRoleClient();
    const rateLimit = await checkRateLimit(
      admin,
      ISSUE_RATE_LIMIT,
      session.resident.id,
    );
    if (!rateLimit.allowed) {
      const response = json({ error: "rate_limited" }, 429);
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }
  } catch (error) {
    logEvent("error", "issue.rate_limit_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const rawLatitude = formData.get("latitude");
  const rawLongitude = formData.get("longitude");
  const rawText = formData.get("text");

  const parsedFields = issueSubmissionInputSchema.safeParse({
    latitude: rawLatitude,
    longitude: rawLongitude,
    text: typeof rawText === "string" ? rawText : undefined,
  });

  if (!parsedFields.success) {
    return json({ error: "invalid_input" }, 400);
  }

  const { latitude, longitude, text } = parsedFields.data;

  // Process uploaded photos
  const rawPhotos = formData.getAll("photos");
  const photos: File[] = [];
  for (const item of rawPhotos) {
    if (item instanceof File && item.size > 0) {
      if (
        !ALLOWED_PHOTO_MIME_TYPES.includes(
          item.type as (typeof ALLOWED_PHOTO_MIME_TYPES)[number],
        )
      ) {
        return json({ error: "unsupported_photo_type" }, 400);
      }
      if (item.size > MAX_PHOTO_SIZE_BYTES) {
        return json({ error: "photo_too_large" }, 400);
      }
      photos.push(item);
    }
  }

  if (photos.length > MAX_PHOTO_COUNT) {
    return json({ error: "too_many_photos" }, 400);
  }

  // Process voice note
  const rawVoiceNote = formData.get("voiceNote");
  let voiceNote: File | null = null;
  if (rawVoiceNote instanceof File && rawVoiceNote.size > 0) {
    if (
      !ALLOWED_VOICE_MIME_TYPES.includes(
        rawVoiceNote.type as (typeof ALLOWED_VOICE_MIME_TYPES)[number],
      )
    ) {
      return json({ error: "unsupported_voice_type" }, 400);
    }
    if (rawVoiceNote.size > MAX_VOICE_SIZE_BYTES) {
      return json({ error: "voice_note_too_large" }, 400);
    }
    voiceNote = rawVoiceNote;
  }

  // Refine rule: at least one of text, voiceNote, or photo is required
  const hasText = Boolean(text && text.trim().length > 0);
  const hasPhoto = photos.length > 0;
  const hasVoice = Boolean(voiceNote);

  if (!hasText && !hasPhoto && !hasVoice) {
    return json({ error: "missing_content" }, 400);
  }

  const issueId = randomUUID();
  const communityId = session.activeCommunityId;

  // Upload media files to Storage (private buckets via trusted service-role after membership guard)
  const photoPaths: string[] = [];
  let voiceNotePath: string | null = null;

  try {
    for (const photo of photos) {
      const ext = photo.name.split(".").pop() || "jpg";
      const storageKey = `${communityId}/${issueId}/${randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("evidence-photos")
        .upload(storageKey, photo, {
          contentType: photo.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      photoPaths.push(storageKey);
    }

    if (voiceNote) {
      const ext = voiceNote.name.split(".").pop() || "webm";
      const storageKey = `${communityId}/${issueId}/${randomUUID()}.${ext}`;
      const { error: uploadError } = await admin.storage
        .from("voice-notes")
        .upload(storageKey, voiceNote, {
          contentType: voiceNote.type,
          upsert: false,
        });
      if (uploadError) throw uploadError;
      voiceNotePath = storageKey;
    }
  } catch (error) {
    logEvent("error", "issue.media_upload_failed", describeError(error));
    return json({ error: "storage_failed" }, 500);
  }

  // Insert into `issues` table
  // geo is optional: if the resident provided coordinates, store as WKT; otherwise null.
  const hasGeo = latitude !== undefined && longitude !== undefined;
  const geoWkt = hasGeo ? `SRID=4326;POINT(${longitude} ${latitude})` : null;
  try {
    const { error: insertError } = await db.from("issues").insert({
      id: issueId,
      community_id: communityId,
      reporter_id: session.resident.id,
      raw_text: hasText ? text : null,
      photo_paths: photoPaths,
      voice_note_path: voiceNotePath,
      geo: geoWkt,
      category_id: null,
    });

    if (insertError) throw insertError;
  } catch (error) {
    logEvent("error", "issue.insert_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  // Pre-AI Default consolidation (Task 4.2): creates 1:1 incident
  let incidentId: string | undefined;
  try {
    const consolidationResult = await consolidateDefault(db, issueId);
    if (consolidationResult.kind === "linked") {
      incidentId = consolidationResult.incidentId;
    }
  } catch (error) {
    logEvent("warn", "issue.auto_consolidation_failed", describeError(error));
  }

  return json(
    {
      issueId,
      ...(incidentId ? { incidentId } : {}),
    },
    201,
  );
}
