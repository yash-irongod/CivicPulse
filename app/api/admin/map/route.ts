// GET /api/admin/map — Incident Geo Data for Map View (Task 9.3, §7.2, §7.4).
// Returns spatial points and severity for open incidents.

import { NextResponse } from "next/server";

import {
  UnauthorizedError,
  requireRole,
  unauthorizedResponse,
} from "@/lib/auth/guards";
import { describeError, logEvent } from "@/lib/auth/log";
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
    // Join issues with incidents to extract geo points
    const { data: issues, error } = await db
      .from("issues")
      .select(
        `
        id,
        geo,
        raw_text,
        incident_links:incident_issues(
          incident:incidents(
            id,
            canonical_description,
            severity,
            status
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
    };

    type RawIssueGeo = {
      id: string;
      geo: unknown;
      raw_text: string | null;
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
          // e.g. "POINT(77.209 28.6139)" or "SRID=4326;POINT(77.209 28.6139)"
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

        // Skip issues without valid coordinates — never plot at fake defaults
        if (lat === null || lng === null) return [];

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
