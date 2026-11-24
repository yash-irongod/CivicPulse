// GET /api/admin/map — Incident Geo Data for Map View (Phase 6).
// Returns spatial coordinates, severity, status, category, team, and SLA info.

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
    session = await requireRole(["committee_admin", "maintenance_staff"], db);
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse(error);
    logEvent("error", "map_api.auth_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }

  try {
    const { data: issues, error } = await db
      .from("issues")
      .select(
        `
        id,
        geo,
        raw_text,
        submitted_at,
        incident_links:incident_issues(
          incident:incidents(
            id,
            canonical_description,
            severity,
            status,
            sla_target_at,
            created_at,
            category:categories(name),
            team:teams(name)
          )
        )
      `,
      )
      .eq("community_id", session.activeCommunityId);

    if (error) throw error;

    type RawIncident = {
      id: string;
      canonical_description: string | null;
      severity: string | null;
      status: string;
      sla_target_at: string | null;
      created_at: string;
      category?: { name: string } | Array<{ name: string }> | null;
      team?: { name: string } | Array<{ name: string }> | null;
    };

    type RawIssueGeo = {
      id: string;
      geo: unknown;
      raw_text: string | null;
      submitted_at: string;
      incident_links?: Array<{
        incident: RawIncident | RawIncident[];
      }>;
    };

    const points = ((issues as unknown as RawIssueGeo[]) || []).flatMap(
      (issue) => {
        const link = issue.incident_links?.[0];
        const incident = Array.isArray(link?.incident)
          ? link.incident[0]
          : link?.incident;
        if (!incident) return [];

        let lat: number | null = null;
        let lng: number | null = null;

        if (typeof issue.geo === "string") {
          const match = issue.geo.match(
            /POINT\s*\(\s*([-\d.]+)\s+([-\d.]+)\s*\)/i,
          );
          if (match && match[1] && match[2]) {
            lng = parseFloat(match[1]);
            lat = parseFloat(match[2]);
          }
        } else if (
          typeof issue.geo === "object" &&
          issue.geo !== null &&
          "coordinates" in issue.geo
        ) {
          const coords = (issue.geo as { coordinates: [number, number] })
            .coordinates;
          lng = coords[0];
          lat = coords[1];
        }

        // Skip issues without valid coordinates — never plot fake coordinates
        if (
          lat === null ||
          lng === null ||
          Number.isNaN(lat) ||
          Number.isNaN(lng)
        ) {
          return [];
        }

        const cat = Array.isArray(incident.category)
          ? incident.category[0]
          : incident.category;
        const tm = Array.isArray(incident.team)
          ? incident.team[0]
          : incident.team;
        const remaining = incident.sla_target_at
          ? hoursRemaining({ sla_target_at: incident.sla_target_at })
          : null;

        return [
          {
            id: incident.id,
            issueId: issue.id,
            lat,
            lng,
            severity: incident.severity || "medium",
            status: incident.status,
            description:
              incident.canonical_description || issue.raw_text || "Report",
            categoryName: cat?.name ?? null,
            teamName: tm?.name ?? null,
            hoursRemaining: remaining,
            isOverdue: remaining !== null && remaining < 0,
            createdAt: incident.created_at || issue.submitted_at,
          },
        ];
      },
    );

    return json({ points }, 200);
  } catch (error) {
    logEvent("error", "map_api.fetch_failed", describeError(error));
    return json({ error: "server_error" }, 500);
  }
}
