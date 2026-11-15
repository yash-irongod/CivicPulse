import { describe, expect, it } from "vitest";

import {
  MAX_NOTE_LENGTH,
  transitionRequestSchema,
  transitionRpcResultSchema,
} from "../../../lib/validation/transition";

const GUID = "00000000-0000-0000-0000-000000009001";

function messages(input: unknown): string[] {
  const parsed = transitionRequestSchema.safeParse(input);
  return parsed.success
    ? []
    : parsed.error.issues.map((issue) => issue.message);
}

describe("transitionRequestSchema", () => {
  it("accepts a bare transition", () => {
    expect(
      transitionRequestSchema.safeParse({ toStatus: "validated" }).success,
    ).toBe(true);
  });

  it("accepts an assignment-only request with no toStatus", () => {
    const parsed = transitionRequestSchema.safeParse({
      categoryId: GUID,
      assignedTeamId: GUID,
      severity: "high",
    });
    expect(parsed.success).toBe(true);
  });

  it("accepts a transition with every optional field", () => {
    const parsed = transitionRequestSchema.safeParse({
      toStatus: "assigned",
      categoryId: GUID,
      assignedTeamId: GUID,
      severity: "critical",
      note: "  sent to plumbing  ",
    });
    expect(parsed.success && parsed.data.note).toBe("sent to plumbing");
  });

  it("rejects an empty request with a distinguishable code, not a silent no-op", () => {
    expect(messages({})).toContain("empty_request");
  });

  it("rejects a request carrying only a note: nothing to attach it to", () => {
    expect(messages({ note: "hello" })).toContain("note_requires_transition");
  });

  it("rejects an unknown status, severity, or malformed id", () => {
    expect(
      transitionRequestSchema.safeParse({ toStatus: "archived" }).success,
    ).toBe(false);
    expect(
      transitionRequestSchema.safeParse({
        toStatus: "validated",
        severity: "urgent",
      }).success,
    ).toBe(false);
    expect(
      transitionRequestSchema.safeParse({ categoryId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects a blank or oversized note", () => {
    expect(
      transitionRequestSchema.safeParse({ toStatus: "validated", note: "   " })
        .success,
    ).toBe(false);
    expect(
      transitionRequestSchema.safeParse({
        toStatus: "validated",
        note: "x".repeat(MAX_NOTE_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("has no actor field — an actor smuggled into the body is ignored, never used", () => {
    const parsed = transitionRequestSchema.safeParse({
      toStatus: "validated",
      actorId: GUID,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "actorId" in parsed.data).toBe(false);
  });
});

describe("transitionRpcResultSchema", () => {
  const row = {
    out_incident_id: GUID,
    out_from_status: "reported",
    out_to_status: "validated",
    out_history_id: GUID,
  };

  it("parses exactly one row", () => {
    expect(transitionRpcResultSchema.safeParse([row]).success).toBe(true);
    expect(transitionRpcResultSchema.safeParse([]).success).toBe(false);
    expect(transitionRpcResultSchema.safeParse([row, row]).success).toBe(false);
  });

  it("allows a null history id (assignment-only call) but not an unknown status", () => {
    expect(
      transitionRpcResultSchema.safeParse([{ ...row, out_history_id: null }])
        .success,
    ).toBe(true);
    expect(
      transitionRpcResultSchema.safeParse([
        { ...row, out_to_status: "archived" },
      ]).success,
    ).toBe(false);
  });
});
