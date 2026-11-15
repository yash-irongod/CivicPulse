import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  consolidateDefault,
  mergeIssueIntoIncident,
  searchOpenIncidentsForIssue,
} from "../../../lib/lifecycle/consolidate";

const ISSUE_ID = "00000000-0000-0000-0000-0000000f0001";
const INCIDENT_ID = "00000000-0000-0000-0000-0000000d0001";
const OTHER_INCIDENT_ID = "00000000-0000-0000-0000-0000000d0002";
const COMMUNITY_ID = "00000000-0000-0000-0000-00000000c001";
const ACTOR_ID = "00000000-0000-0000-0000-0000000e0001";

afterEach(() => {
  vi.restoreAllMocks();
});

function silence() {
  return {
    info: vi.spyOn(console, "info").mockImplementation(() => undefined),
    warn: vi.spyOn(console, "warn").mockImplementation(() => undefined),
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

describe("consolidateDefault", () => {
  it("calls the RPC with the issue id and returns the linked incident", async () => {
    const { client, rpc } = rpcClient({
      data: [{ out_incident_id: INCIDENT_ID, out_created: true }],
      error: null,
    });
    await expect(consolidateDefault(client, ISSUE_ID)).resolves.toEqual({
      kind: "linked",
      incidentId: INCIDENT_ID,
      created: true,
    });
    expect(rpc).toHaveBeenCalledWith("consolidate_issue_default", {
      p_issue_id: ISSUE_ID,
    });
  });

  it("reports created: false on an idempotent repeat", async () => {
    const { client } = rpcClient({
      data: [{ out_incident_id: INCIDENT_ID, out_created: false }],
      error: null,
    });
    const result = await consolidateDefault(client, ISSUE_ID);
    expect(result.kind === "linked" && result.created).toBe(false);
  });

  it("maps P0002 to issue_not_found rather than a generic error", async () => {
    silence();
    const { client } = rpcClient({
      data: null,
      error: { code: "P0002", message: "no" },
    });
    await expect(consolidateDefault(client, ISSUE_ID)).resolves.toEqual({
      kind: "issue_not_found",
    });
  });

  it("returns error, not a crash, on an unexpected RPC failure", async () => {
    const spies = silence();
    const { client } = rpcClient({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    await expect(consolidateDefault(client, ISSUE_ID)).resolves.toEqual({
      kind: "error",
    });
    expect(spies.error.mock.calls.flat().join("\n")).toContain(
      "consolidate.default_failed",
    );
  });

  it("returns error on a malformed RPC response rather than trusting it", async () => {
    silence();
    const { client } = rpcClient({
      data: [{ out_incident_id: "not-a-uuid" }],
      error: null,
    });
    await expect(consolidateDefault(client, ISSUE_ID)).resolves.toEqual({
      kind: "error",
    });
  });
});

function searchClient(
  issueResult: { data: unknown; error: unknown },
  rpcResult: { data: unknown; error: unknown },
) {
  const maybeSingle = vi.fn().mockResolvedValue(issueResult);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue(rpcResult);
  return { client: { from, rpc } as unknown as SupabaseClient, from, eq, rpc };
}

describe("searchOpenIncidentsForIssue", () => {
  it("looks up the issue, then searches using ITS community/geo/category", async () => {
    const { client, rpc } = searchClient(
      {
        data: {
          community_id: COMMUNITY_ID,
          geo: "SRID=4326;POINT(77.2 28.6)",
          category_id: null,
        },
        error: null,
      },
      { data: [], error: null },
    );
    await searchOpenIncidentsForIssue(client, ISSUE_ID, {
      radiusMeters: 500,
      windowHours: 72,
    });
    expect(rpc).toHaveBeenCalledWith("open_incidents_near", {
      p_community_id: COMMUNITY_ID,
      p_near_geo: "SRID=4326;POINT(77.2 28.6)",
      p_radius_meters: 500,
      p_time_window_hours: 72,
      p_category_id: null,
    });
  });

  it("passes the issue's own category_id through when it has one", async () => {
    const { client, rpc } = searchClient(
      {
        data: {
          community_id: COMMUNITY_ID,
          geo: "SRID=4326;POINT(77.2 28.6)",
          category_id: "00000000-0000-0000-0000-000000009001",
        },
        error: null,
      },
      { data: [], error: null },
    );
    await searchOpenIncidentsForIssue(client, ISSUE_ID, {
      radiusMeters: 500,
      windowHours: 72,
    });
    expect(rpc).toHaveBeenCalledWith(
      "open_incidents_near",
      expect.objectContaining({
        p_category_id: "00000000-0000-0000-0000-000000009001",
      }),
    );
  });

  it("returns issue_not_found without ever calling the search RPC", async () => {
    const { client, rpc } = searchClient(
      { data: null, error: null },
      { data: [], error: null },
    );
    await expect(
      searchOpenIncidentsForIssue(client, ISSUE_ID, {
        radiusMeters: 1,
        windowHours: 1,
      }),
    ).resolves.toEqual({ kind: "issue_not_found" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps the RPC rows into camelCase candidates", async () => {
    const { client } = searchClient(
      {
        data: { community_id: COMMUNITY_ID, geo: "g", category_id: null },
        error: null,
      },
      {
        data: [
          {
            id: INCIDENT_ID,
            canonical_description: "Drain",
            category_id: null,
            severity: "high",
            status: "reported",
            distance_meters: 12.5,
            created_at: "2026-01-01T00:00:00Z",
          },
        ],
        error: null,
      },
    );
    const result = await searchOpenIncidentsForIssue(client, ISSUE_ID, {
      radiusMeters: 1,
      windowHours: 1,
    });
    expect(result).toEqual({
      kind: "found",
      candidates: [
        {
          id: INCIDENT_ID,
          canonicalDescription: "Drain",
          categoryId: null,
          severity: "high",
          status: "reported",
          distanceMeters: 12.5,
          createdAt: "2026-01-01T00:00:00Z",
        },
      ],
    });
  });

  it("returns error, not a crash, when the search RPC fails", async () => {
    const spies = silence();
    const { client } = searchClient(
      {
        data: { community_id: COMMUNITY_ID, geo: "g", category_id: null },
        error: null,
      },
      { data: null, error: { code: "22023", message: "bad radius" } },
    );
    await expect(
      searchOpenIncidentsForIssue(client, ISSUE_ID, {
        radiusMeters: -1,
        windowHours: 1,
      }),
    ).resolves.toEqual({ kind: "error" });
    expect(spies.error.mock.calls.flat().join("\n")).toContain(
      "consolidate.search_failed",
    );
  });
});

describe("mergeIssueIntoIncident", () => {
  it("calls the RPC with both ids and returns the before/after incident ids", async () => {
    const { client, rpc } = rpcClient({
      data: [
        {
          out_previous_incident_id: INCIDENT_ID,
          out_target_incident_id: OTHER_INCIDENT_ID,
        },
      ],
      error: null,
    });
    await expect(
      mergeIssueIntoIncident(client, ISSUE_ID, OTHER_INCIDENT_ID, ACTOR_ID),
    ).resolves.toEqual({
      kind: "merged",
      previousIncidentId: INCIDENT_ID,
      targetIncidentId: OTHER_INCIDENT_ID,
    });
    expect(rpc).toHaveBeenCalledWith("merge_issue_into_incident", {
      p_issue_id: ISSUE_ID,
      p_target_incident_id: OTHER_INCIDENT_ID,
      p_actor_resident_id: ACTOR_ID,
    });
  });

  it.each([
    ["P0002", "not_found"],
    ["23514", "target_not_open"],
    ["22023", "different_community"],
  ] as const)("maps SQLSTATE %s to result kind %s", async (code, kind) => {
    silence();
    const { client } = rpcClient({ data: null, error: { code, message: "x" } });
    await expect(
      mergeIssueIntoIncident(client, ISSUE_ID, OTHER_INCIDENT_ID, ACTOR_ID),
    ).resolves.toEqual({
      kind,
    });
  });

  it("returns error, not a crash, on an unrecognised failure", async () => {
    const spies = silence();
    const { client } = rpcClient({
      data: null,
      error: { code: "XX000", message: "boom" },
    });
    await expect(
      mergeIssueIntoIncident(client, ISSUE_ID, OTHER_INCIDENT_ID, ACTOR_ID),
    ).resolves.toEqual({
      kind: "error",
    });
    expect(spies.error.mock.calls.flat().join("\n")).toContain(
      "consolidate.merge_failed",
    );
  });
});
