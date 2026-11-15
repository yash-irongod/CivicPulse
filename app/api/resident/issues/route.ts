// GET /api/resident/issues — List issues and linked incidents reported by the logged-in resident (Task 8.3).
// Scoped strictly to the resident's own reports.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
import { hoursRemaining } from "@/lib/lifecycle/sla";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

function json(body: Record<string, unknown>, status: number): NextResponse {
  const response = NextResponse.json(body, { status });
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(): Promise<Response> {
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
    logEvent("error", "resident_issues.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    // 1. Fetch resident's issues
    const { data: issues, error: issuesError } = await db
      .from("issues")
      .select(
        `
        id,
        raw_text,
        submitted_at,
        photo_paths,
        category:categories(id, name),
        incident_links:incident_issues(
          incident:incidents(
            id,
            status,
            severity,
            sla_target_at,
            created_at,
            resolved_at,
            closed_at,
            history:incident_status_history(
              id,
              from_status,
              to_status,
              note,
              created_at
            )
          )
        )
      `,
      )
      .eq("reporter_id", session.resident.id)
      .order("submitted_at", { ascending: false });

    if (issuesError) throw issuesError;

    const formattedIssues = (issues || []).map((issue) => {
      // Safely extract linked incident
      type IncidentItem = {
        id: string;
        status: string;
        severity: string | null;
        sla_target_at: string | null;
        created_at: string;
        resolved_at: string | null;
        closed_at: string | null;
        history?: Array<{
          id: string;
          from_status: string | null;
          to_status: string;
          note: string | null;
          created_at: string;
        }>;
      };

      const link = issue.incident_links?.[0] as
        { incident: IncidentItem } | undefined;
      const incident = link?.incident;

      const category = Array.isArray(issue.category)
        ? issue.category[0]
        : (issue.category as { id: string; name: string } | null);

      return {
        id: issue.id,
        text: issue.raw_text,
        submittedAt: issue.submitted_at,
        photoPaths: issue.photo_paths || [],
        category: category ? { id: category.id, name: category.name } : null,
        incident: incident
          ? {
              id: incident.id,
              status: incident.status,
              severity: incident.severity,
              slaTargetAt: incident.sla_target_at,
              hoursRemaining: incident.sla_target_at
                ? hoursRemaining({ sla_target_at: incident.sla_target_at })
                : null,
              createdAt: incident.created_at,
              resolvedAt: incident.resolved_at,
              closedAt: incident.closed_at,
              history: (incident.history || []).sort(
                (a, b) =>
                  new Date(a.created_at).getTime() -
                  new Date(b.created_at).getTime(),
              ),
            }
          : null,
      };
    });

    return json({ issues: formattedIssues }, 200);
  } catch (error) {
    logEvent("error", "resident_issues.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
