// POST /api/incidents/[id]/evidence-check — Submit resolution evidence and run AI verification (Task 5.4, §6.7, §10).
// Sets incident status to evidence_checked with AI suggestion attached for admin review.
// NEVER auto-transitions to resolved — resolution requires human approval.

import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { checkResolutionEvidence } from "@/lib/ai/evidence-check";
import { transitionIncident } from "@/lib/lifecycle/state-machine";
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
  request: NextRequest,
  { params }: RouteContext,
): Promise<Response> {
  const { id: incidentId } = await params;

  if (!z.guid().safeParse(incidentId).success) {
    return json({ error: "not_found" }, 404);
  }

  let db;
  let session;
  try {
    db = await createSupabaseServerClient();
    session = await requireRole(["maintenance_staff", "committee_admin"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "evidence_check.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  // Load incident details
  const { data: incident, error: incidentError } = await db
    .from("incidents")
    .select("id, community_id, canonical_description, status")
    .eq("id", incidentId)
    .maybeSingle();

  if (incidentError || !incident) {
    return json({ error: "incident_not_found" }, 404);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return json({ error: "invalid_body" }, 400);
  }

  const rawAfterPhoto = formData.get("afterPhoto");
  const rawNote = formData.get("note");
  const note = typeof rawNote === "string" ? rawNote.trim() : null;

  if (!(rawAfterPhoto instanceof File) || rawAfterPhoto.size === 0) {
    return json({ error: "missing_after_photo" }, 400);
  }

  // Convert after photo to base64 for multimodal reasoning
  const afterBuffer = Buffer.from(await rawAfterPhoto.arrayBuffer());
  const afterBase64 = afterBuffer.toString("base64");

  // Upload after photo to Storage
  const admin = createSupabaseServiceRoleClient();
  const ext = rawAfterPhoto.name.split(".").pop() || "jpg";
  const storagePath = `${incident.community_id}/${incidentId}/resolution-${randomUUID()}.${ext}`;

  try {
    const { error: uploadError } = await admin.storage
      .from("evidence-photos")
      .upload(storagePath, rawAfterPhoto, {
        contentType: rawAfterPhoto.type,
        upsert: false,
      });
    if (uploadError) throw uploadError;
  } catch (err) {
    logEvent("error", "evidence_check.photo_upload_failed", describeError(err));
    return json({ error: "storage_failed" }, 500);
  }

  // Run AI evidence check
  const checkResult = await checkResolutionEvidence({
    originalDescription:
      incident.canonical_description || "Reported community issue",
    afterPhotoBase64: afterBase64,
    afterPhotoMimeType: rawAfterPhoto.type,
    staffNote: note,
  });

  // Record evidence and AI check on incident
  try {
    const { error: updateError } = await admin
      .from("incidents")
      .update({
        resolution_after_photo: storagePath,
        resolution_note: note,
        evidence_ai_check: checkResult,
      })
      .eq("id", incidentId);

    if (updateError) throw updateError;
  } catch (err) {
    logEvent("error", "evidence_check.update_failed", describeError(err));
    return json({ error: "server_error" }, 500);
  }

  // Advance state: if in_progress -> resolution_submitted -> evidence_checked
  if (incident.status === "in_progress") {
    await transitionIncident(
      { db, admin },
      {
        incidentId,
        actorResidentId: session.resident.id,
        toStatus: "resolution_submitted",
        note: "Resolution evidence submitted by staff",
      },
    );
    await transitionIncident(
      { db, admin },
      {
        incidentId,
        actorResidentId: session.resident.id,
        toStatus: "evidence_checked",
        note: `AI check completed (consistent: ${checkResult.consistent}, confidence: ${checkResult.confidence})`,
      },
    );
  } else if (incident.status === "resolution_submitted") {
    await transitionIncident(
      { db, admin },
      {
        incidentId,
        actorResidentId: session.resident.id,
        toStatus: "evidence_checked",
        note: `AI check completed (consistent: ${checkResult.consistent}, confidence: ${checkResult.confidence})`,
      },
    );
  }

  return json(
    {
      checkResult,
      evidenceSubmitted: true,
      currentStatus: "evidence_checked",
    },
    200,
  );
}
