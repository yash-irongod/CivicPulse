import { describe, expect, it } from "vitest";

import {
  classifyClaimEntry,
  hashClaimToken,
  noticeForEntryState,
  noticeForRefusedOutcome,
  syntheticEmailForEntry,
} from "../../../lib/auth/claim-token";
import {
  CLAIM_OUTCOMES,
  SYNTHETIC_EMAIL_DOMAIN,
  emailSchema,
} from "../../../lib/validation/claim";

describe("hashClaimToken", () => {
  it("matches the SHA-256 vector the SQL test asserts for 'abc'", () => {
    // Same vector as tests/db/resident_roster.test.sql: the database stores
    // encode(sha256(convert_to(token,'UTF8')),'hex'), so these must agree.
    expect(hashClaimToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("returns 64 lowercase hex characters and is deterministic", () => {
    const token = "a".repeat(64);
    expect(hashClaimToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashClaimToken(token)).toBe(hashClaimToken(token));
  });

  it("is case-sensitive, so callers must normalise before hashing", () => {
    expect(hashClaimToken("ABC")).not.toBe(hashClaimToken("abc"));
  });

  it("hashes non-ASCII input as UTF-8", () => {
    expect(hashClaimToken("नमस्ते")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("syntheticEmailForEntry", () => {
  const id = "3F2B8F0E-6A4E-4B7C-9D1A-2C5E7A8B9C01";

  it("is deterministic per entry and lower-cased", () => {
    expect(syntheticEmailForEntry(id)).toBe(
      `roster-3f2b8f0e-6a4e-4b7c-9d1a-2c5e7a8b9c01@${SYNTHETIC_EMAIL_DOMAIN}`,
    );
  });

  it("uses a reserved .invalid domain that can never receive mail", () => {
    expect(syntheticEmailForEntry(id).endsWith(".invalid")).toBe(true);
  });

  it("can never be typed in as a real address", () => {
    expect(emailSchema.safeParse(syntheticEmailForEntry(id)).success).toBe(
      false,
    );
  });

  it("differs between entries", () => {
    expect(syntheticEmailForEntry(id)).not.toBe(
      syntheticEmailForEntry("00000000-0000-4000-8000-000000000000"),
    );
  });
});

describe("classifyClaimEntry", () => {
  const now = new Date("2026-09-24T10:00:00.000Z");
  const future = "2026-09-25T10:00:00.000Z";
  const past = "2026-09-23T10:00:00.000Z";

  it("is claimable when pending and unexpired", () => {
    expect(
      classifyClaimEntry({ status: "pending", expiresAt: future }, now),
    ).toBe("claimable");
  });

  it("is expired at exactly the expiry instant", () => {
    expect(
      classifyClaimEntry(
        { status: "pending", expiresAt: now.toISOString() },
        now,
      ),
    ).toBe("expired");
  });

  it("is expired when the expiry is in the past", () => {
    expect(
      classifyClaimEntry({ status: "pending", expiresAt: past }, now),
    ).toBe("expired");
  });

  it("fails closed when a pending entry has no or unparseable expiry", () => {
    expect(
      classifyClaimEntry({ status: "pending", expiresAt: null }, now),
    ).toBe("expired");
    expect(
      classifyClaimEntry({ status: "pending", expiresAt: "not a date" }, now),
    ).toBe("expired");
  });

  it("reports claimed and revoked regardless of expiry", () => {
    expect(
      classifyClaimEntry({ status: "claimed", expiresAt: future }, now),
    ).toBe("claimed");
    expect(
      classifyClaimEntry({ status: "revoked", expiresAt: future }, now),
    ).toBe("revoked");
  });
});

describe("notice mapping", () => {
  it("maps each non-claimable entry state to its own notice", () => {
    expect(noticeForEntryState("claimed")).toBe("link_used");
    expect(noticeForEntryState("revoked")).toBe("link_revoked");
    expect(noticeForEntryState("expired")).toBe("link_expired");
  });

  it("maps every refused database outcome", () => {
    const refused = CLAIM_OUTCOMES.filter((o) => o !== "claimed");
    expect(refused.map((o) => noticeForRefusedOutcome(o))).toEqual([
      "link_invalid",
      "link_used",
      "link_expired",
      "link_revoked",
      "link_invalid",
    ]);
  });

  it("does not reveal ownership for bound_to_other_user", () => {
    expect(noticeForRefusedOutcome("bound_to_other_user")).toBe(
      noticeForRefusedOutcome("invalid"),
    );
  });
});
