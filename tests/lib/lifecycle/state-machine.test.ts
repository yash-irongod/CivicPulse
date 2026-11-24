import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  INCIDENT_STATUSES,
  allowedTransitions,
  isValidTransition,
  transitionIncident,
  type IncidentStatus,
} from "../../../lib/lifecycle/state-machine";

const INCIDENT_ID = "00000000-0000-0000-0000-0000000d0001";
const ACTOR_ID = "00000000-0000-0000-0000-0000000e0001";
const HISTORY_ID = "00000000-0000-0000-0000-0000000b0001";
const CATEGORY_ID = "00000000-0000-0000-0000-000000009001";
const TEAM_ID = "00000000-0000-0000-0000-00000000a001";

afterEach(() => {
  vi.restoreAllMocks();
});

function silence() {
  return {
    error: vi.spyOn(console, "error").mockImplementation(() => undefined),
  };
}

// The SAME literal list tests/db/incident_transitions.test.sql checks against
// 0011's in-database copy of the table. If either table changes, one of the
// two tests fails until this list (and the other copy) is updated too.
const ALLOWED: ReadonlyArray<readonly [IncidentStatus, IncidentStatus]> = [
  ["reported", "validated"],
  ["validated", "prioritized"],
  ["prioritized", "assigned"],
  ["assigned", "in_progress"],
  ["in_progress", "resolution_submitted"],
  ["resolution_submitted", "evidence_checked"],
  ["resolution_submitted", "assigned"],
  ["evidence_checked", "resolved"],
  ["evidence_checked", "assigned"],
  ["resolved", "resident_feedback"],
  ["resident_feedback", "closed"],
  ["resident_feedback", "escalated"],
  ["escalated", "assigned"],
  ["escalated", "closed"],
];

describe("isValidTransition: the full matrix", () => {
  const allowedKeys = new Set(ALLOWED.map(([from, to]) => `${from}>${to}`));

  it("has the eleven states of the lifecycle", () => {
    expect(INCIDENT_STATUSES).toHaveLength(11);
  });

  for (const from of INCIDENT_STATUSES) {
    for (const to of INCIDENT_STATUSES) {
      const expected = allowedKeys.has(`${from}>${to}`);
      it(`${from} -> ${to} is ${expected ? "allowed" : "rejected"}`, () => {
        expect(isValidTransition(from, to)).toBe(expected);
      });
    }
  }
});

describe("isValidTransition: the cases the plan calls out", () => {
  it("rejects reported -> resolved, which skips every intermediate state", () => {
    expect(isValidTransition("reported", "resolved")).toBe(false);
  });

  it("routes resident feedback: >=4 stars -> closed, <=3 stars -> escalated", () => {
    expect(isValidTransition("resident_feedback", "closed")).toBe(true);
    expect(isValidTransition("resident_feedback", "escalated")).toBe(true);
    // Residents do NOT have direct reopen power anymore
    expect(isValidTransition("resident_feedback", "assigned")).toBe(false);
  });

  it("allows admin decision on escalated tickets: assigned (rework) or closed", () => {
    expect(isValidTransition("escalated", "assigned")).toBe(true);
    expect(isValidTransition("escalated", "closed")).toBe(true);
  });

  it("treats closed as terminal", () => {
    expect(allowedTransitions("closed")).toEqual([]);
  });

  it("never allows staying in the same state as a 'transition'", () => {
    for (const status of INCIDENT_STATUSES) {
      expect(isValidTransition(status, status)).toBe(false);
    }
  });

  it("has no general undo: backward moves are limited to documented rejection/reopen paths", () => {
    const order = [...INCIDENT_STATUSES];
    const backward = ALLOWED.filter(
      ([from, to]) => order.indexOf(to) < order.indexOf(from),
    );
    // Three backward paths:
    // 1. resolution_submitted → assigned (admin rejects before AI check)
    // 2. evidence_checked → assigned (admin rejects after AI check)
    // 3. escalated → assigned (admin reopens escalated ticket for rework)
    expect(backward).toEqual([
      ["resolution_submitted", "assigned"],
      ["evidence_checked", "assigned"],
      ["escalated", "assigned"],
    ]);
  });
});

function clients(options: {
  current?: IncidentStatus | null;
  rpc?: { data: unknown; error: unknown };
  rereadCurrent?: IncidentStatus | null;
}) {
  const reads = [options.current === undefined ? "reported" : options.current];
  if (options.rereadCurrent !== undefined) reads.push(options.rereadCurrent);
  const maybeSingle = vi.fn().mockImplementation(async () => {
    const status = reads.length > 1 ? reads.shift() : reads[0];
    return { data: status === null ? null : { status }, error: null };
  });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  const rpc = vi.fn().mockResolvedValue(
    options.rpc ?? {
      data: [
        {
          out_incident_id: INCIDENT_ID,
          out_from_status: "reported",
          out_to_status: "validated",
          out_history_id: HISTORY_ID,
        },
      ],
      error: null,
    },
  );
  return {
    clients: {
      db: { from } as unknown as SupabaseClient,
      admin: { rpc } as unknown as SupabaseClient,
    },
    rpc,
  };
}

describe("transitionIncident", () => {
  it("passes the ACTOR from input (never anything else) and every field to the RPC", async () => {
    const { clients: c, rpc } = clients({});
    await transitionIncident(c, {
      incidentId: INCIDENT_ID,
      actorResidentId: ACTOR_ID,
      toStatus: "validated",
      categoryId: CATEGORY_ID,
      assignedTeamId: TEAM_ID,
      severity: "high",
      note: "looks right",
    });
    expect(rpc).toHaveBeenCalledWith("transition_incident", {
      p_incident_id: INCIDENT_ID,
      p_actor_resident_id: ACTOR_ID,
      p_to_status: "validated",
      p_category_id: CATEGORY_ID,
      p_assigned_team_id: TEAM_ID,
      p_severity: "high",
      p_note: "looks right",
    });
  });

  it("returns the before/after status and the history id on success", async () => {
    const { clients: c } = clients({});
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "validated",
      }),
    ).resolves.toEqual({
      kind: "transitioned",
      incidentId: INCIDENT_ID,
      fromStatus: "reported",
      toStatus: "validated",
      historyId: HISTORY_ID,
    });
  });

  it("rejects reported -> resolved with a specific answer and never calls the RPC", async () => {
    const { clients: c, rpc } = clients({ current: "reported" });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "resolved",
      }),
    ).resolves.toEqual({
      kind: "invalid_transition",
      from: "reported",
      to: "resolved",
      allowed: ["validated"],
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts the reopen from escalated and lists what a closed incident may become (nothing)", async () => {
    const reopen = clients({ current: "escalated" });
    await transitionIncident(reopen.clients, {
      incidentId: INCIDENT_ID,
      actorResidentId: ACTOR_ID,
      toStatus: "assigned",
    });
    expect(reopen.rpc).toHaveBeenCalled();

    const closed = clients({ current: "closed" });
    await expect(
      transitionIncident(closed.clients, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "reported",
      }),
    ).resolves.toMatchObject({ kind: "invalid_transition", allowed: [] });
  });

  it("treats an assignment-only call (no toStatus) as valid in ANY state, sending p_to_status null", async () => {
    const { clients: c, rpc } = clients({ current: "closed" });
    await transitionIncident(c, {
      incidentId: INCIDENT_ID,
      actorResidentId: ACTOR_ID,
      categoryId: CATEGORY_ID,
    });
    expect(rpc).toHaveBeenCalledWith(
      "transition_incident",
      expect.objectContaining({
        p_to_status: null,
        p_category_id: CATEGORY_ID,
      }),
    );
  });

  it("returns not_found without calling the RPC when the caller cannot see the incident", async () => {
    const { clients: c, rpc } = clients({ current: null });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "validated",
      }),
    ).resolves.toEqual({ kind: "not_found" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps P0002 from the database (not staff in that community / missing) to not_found", async () => {
    silence();
    const { clients: c } = clients({
      rpc: { data: null, error: { code: "P0002", message: "x" } },
    });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "validated",
      }),
    ).resolves.toEqual({ kind: "not_found" });
  });

  it("maps P0001 (the same-community trigger) to invalid_assignment", async () => {
    silence();
    const { clients: c } = clients({
      rpc: { data: null, error: { code: "P0001", message: "x" } },
    });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        categoryId: CATEGORY_ID,
      }),
    ).resolves.toEqual({ kind: "invalid_assignment" });
  });

  it("handles a concurrent transition: the DB says 22023, so it re-reads and reports the REAL current state", async () => {
    silence();
    const { clients: c } = clients({
      current: "reported",
      rereadCurrent: "validated",
      rpc: {
        data: null,
        error: { code: "22023", message: "invalid transition" },
      },
    });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "validated",
      }),
    ).resolves.toEqual({
      kind: "invalid_transition",
      from: "validated",
      to: "validated",
      allowed: ["prioritized"],
    });
  });

  it("returns error, not a crash, on an unrecognised database failure, and logs it", async () => {
    const spies = silence();
    const { clients: c } = clients({
      rpc: { data: null, error: { code: "XX000", message: "boom" } },
    });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "validated",
      }),
    ).resolves.toEqual({ kind: "error" });
    expect(spies.error.mock.calls.flat().join("\n")).toContain(
      "lifecycle.transition_failed",
    );
  });

  it("does not trust a malformed RPC response", async () => {
    silence();
    const { clients: c } = clients({
      rpc: { data: [{ out_incident_id: "nope" }], error: null },
    });
    await expect(
      transitionIncident(c, {
        incidentId: INCIDENT_ID,
        actorResidentId: ACTOR_ID,
        toStatus: "validated",
      }),
    ).resolves.toEqual({ kind: "error" });
  });

  it("does not trust an unknown status coming back from the incidents read", async () => {
    silence();
    const maybeSingle = vi
      .fn()
      .mockResolvedValue({ data: { status: "archived" }, error: null });
    const db = {
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
    } as unknown as SupabaseClient;
    const rpc = vi.fn();
    await expect(
      transitionIncident(
        { db, admin: { rpc } as unknown as SupabaseClient },
        {
          incidentId: INCIDENT_ID,
          actorResidentId: ACTOR_ID,
          toStatus: "validated",
        },
      ),
    ).resolves.toEqual({ kind: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
