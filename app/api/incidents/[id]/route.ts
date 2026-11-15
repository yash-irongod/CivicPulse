// GET /api/incidents/[id] — Fetch single incident detail with linked issues,
// status history, and team/category info. Used by both maintenance staff job
// detail page and admin incident detail views.
//
// Authorization: any authenticated member of the incident's community (via
// Supabase RLS on incidents table). The requireRole check below limits to
// staff/admin roles who need operational detail.

import { NextResponse } from "next/server";
import { z } from "zod";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { hoursRemaining } from "@/lib/lifecycle/sla";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(
  _request: Request,
  { params }: RouteContext,
): Promise<Response> {
  const { id: incidentId } = await params;

  if (!z.guid().safeParse(incidentId).success) {
    return json({ error: "not_found" }, 404);
  }

  let db;
  try {
    db = await createSupabaseServerClient();
    await requireRole(["committee_admin", "maintenance_staff", "resident"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "incident_detail.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    // 1. Fetch incident with category and team joins (RLS ensures community scope)
    const { data: incident, error: incErr } = await db
      .from("incidents")
      .select(
        `
        id,
        community_id,
        canonical_description,
        category_id,
        severity,
        status,
        assigned_team_id,
        sla_target_at,
        created_at,
        resolved_at,
        closed_at,
        possible_duplicate_of,
        resolution_before_photo,
        resolution_after_photo,
        resolution_note,
        evidence_ai_check,
        category:categories(id, name),
        team:teams(id, name)
      `,
      )
      .eq("id", incidentId)
      .maybeSingle();

    if (incErr) throw incErr;
    if (!incident) return json({ error: "not_found" }, 404);

    // 2. Fetch linked issues with reporter details
    const { data: issueLinks, error: linkErr } = await db
      .from("incident_issues")
      .select(
        `
        issue_id,
        issue:issues(
          id,
          raw_text,
          raw_transcript,
          photo_paths,
          voice_note_path,
          geo,
          submitted_at,
          reporter:residents(id, display_name)
        )
      `,
      )
      .eq("incident_id", incidentId);

    if (linkErr) throw linkErr;

    // 3. Fetch status history (audit trail)
    const { data: history, error: histErr } = await db
      .from("incident_status_history")
      .select(
        `
        id,
        from_status,
        to_status,
        note,
        created_at,
        actor:residents(id, display_name)
      `,
      )
      .eq("incident_id", incidentId)
      .order("created_at", { ascending: true });

    if (histErr) throw histErr;

    // Normalize Supabase's join shape (could be array or object)
    const categoryObj = Array.isArray(incident.category)
      ? incident.category[0]
      : incident.category;
    const teamObj = Array.isArray(incident.team)
      ? incident.team[0]
      : incident.team;

    const remaining = incident.sla_target_at
      ? hoursRemaining({ sla_target_at: incident.sla_target_at })
      : null;

    type RawIssueLink = {
      issue_id: string;
      issue:
        | {
            id: string;
            raw_text: string | null;
            raw_transcript: string | null;
            photo_paths: string[];
            voice_note_path: string | null;
            geo: unknown;
            submitted_at: string;
            reporter:
              | { id: string; display_name: string }
              | Array<{ id: string; display_name: string }>
              | null;
          }
        | Array<{
            id: string;
            raw_text: string | null;
            raw_transcript: string | null;
            photo_paths: string[];
            voice_note_path: string | null;
            geo: unknown;
            submitted_at: string;
            reporter:
              | { id: string; display_name: string }
              | Array<{ id: string; display_name: string }>
              | null;
          }>
        | null;
    };

    const issues = ((issueLinks as unknown as RawIssueLink[]) || [])
      .map((link) => {
        const iss = Array.isArray(link.issue) ? link.issue[0] : link.issue;
        if (!iss) return null;
        const reporter = Array.isArray(iss.reporter)
          ? iss.reporter[0]
          : iss.reporter;
        return {
          id: iss.id,
          rawText: iss.raw_text,
          rawTranscript: iss.raw_transcript,
          photoPaths: iss.photo_paths,
          voiceNotePath: iss.voice_note_path,
          submittedAt: iss.submitted_at,
          reporterName: reporter?.display_name ?? null,
        };
      })
      .filter(Boolean);

    type RawHistoryRow = {
      id: string;
      from_status: string | null;
      to_status: string;
      note: string | null;
      created_at: string;
      actor:
        | { id: string; display_name: string }
        | Array<{ id: string; display_name: string }>
        | null;
    };

    const timeline = ((history as unknown as RawHistoryRow[]) || []).map(
      (h) => {
        const actor = Array.isArray(h.actor) ? h.actor[0] : h.actor;
        return {
          id: h.id,
          fromStatus: h.from_status,
          toStatus: h.to_status,
          note: h.note,
          createdAt: h.created_at,
          actorName: actor?.display_name ?? "System",
        };
      },
    );

    return json(
      {
        incident: {
          id: incident.id,
          communityId: incident.community_id,
          description: incident.canonical_description,
          categoryId: categoryObj?.id ?? null,
          categoryName: categoryObj?.name ?? null,
          severity: incident.severity,
          status: incident.status,
          teamId: teamObj?.id ?? null,
          teamName: teamObj?.name ?? null,
          slaTargetAt: incident.sla_target_at,
          hoursRemaining: remaining,
          isOverdue: remaining !== null && remaining < 0,
          createdAt: incident.created_at,
          resolvedAt: incident.resolved_at,
          closedAt: incident.closed_at,
          possibleDuplicateOf: incident.possible_duplicate_of,
          resolutionBeforePhoto: incident.resolution_before_photo,
          resolutionAfterPhoto: incident.resolution_after_photo,
          resolutionNote: incident.resolution_note,
          evidenceAiCheck: incident.evidence_ai_check,
        },
        issues,
        timeline,
      },
      200,
    );
  } catch (error) {
    logEvent("error", "incident_detail.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
