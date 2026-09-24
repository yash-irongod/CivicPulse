import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  claimRosterEntry,
  lookupClaimEntry,
  prepareNoEmailSignIn,
} from "../../../lib/auth/claim";
import { hashClaimToken } from "../../../lib/auth/claim-token";
import { describeError, scrubSensitive } from "../../../lib/auth/log";

const TOKEN = "0123456789abcdef".repeat(4);
const ID = "3f2b8f0e-6a4e-4b7c-9d1a-2c5e7a8b9c01";
const USER = "9a1c2d3e-4f50-4a6b-8c7d-0e1f2a3b4c5d";

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

function lookupClient(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { client: { from } as unknown as SupabaseClient, from, eq };
}

function rpcClient(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

const claimedRow = {
  claim_outcome: "claimed",
  claimed_resident_id: ID,
  claimed_community_id: ID,
  claimed_space_id: null,
};

describe("lookupClaimEntry", () => {
  const row = {
    id: ID,
    status: "pending",
    claim_token_expires_at: "2026-10-01T00:00:00+00:00",
    display_name: "Asha Verma",
    preferred_language: "hi",
    spaces: { name: "B-204" },
    communities: { name: "Green Park", default_language: "en" },
  };

  it("looks up by the token HASH, never the token", async () => {
    const { client, from, eq } = lookupClient({ data: row, error: null });
    await lookupClaimEntry(client, TOKEN);
    expect(from).toHaveBeenCalledWith("roster_entries");
    expect(eq).toHaveBeenCalledWith("claim_token_hash", hashClaimToken(TOKEN));
    expect(JSON.stringify(eq.mock.calls)).not.toContain(TOKEN);
  });

  it("maps a found row to a view", async () => {
    const { client } = lookupClient({ data: row, error: null });
    await expect(lookupClaimEntry(client, TOKEN)).resolves.toEqual({
      kind: "found",
      entry: {
        id: ID,
        status: "pending",
        expiresAt: "2026-10-01T00:00:00+00:00",
        displayName: "Asha Verma",
        preferredLanguage: "hi",
        spaceName: "B-204",
        communityName: "Green Park",
        communityDefaultLanguage: "en",
      },
    });
  });

  it("handles an entry with no space", async () => {
    const { client } = lookupClient({
      data: { ...row, spaces: null },
      error: null,
    });
    const result = await lookupClaimEntry(client, TOKEN);
    expect(result.kind === "found" && result.entry.spaceName).toBeNull();
  });

  it("reports not_found for an unknown token", async () => {
    const { client } = lookupClient({ data: null, error: null });
    await expect(lookupClaimEntry(client, TOKEN)).resolves.toEqual({
      kind: "not_found",
    });
  });

  it("reports error on a database error and logs without the token", async () => {
    const spies = silence();
    const { client } = lookupClient({
      data: null,
      error: { message: `bad ${TOKEN}`, code: "XX000" },
    });
    await expect(lookupClaimEntry(client, TOKEN)).resolves.toEqual({
      kind: "error",
    });
    const logged = spies.error.mock.calls.flat().join("\n");
    expect(logged).toContain("claim.lookup_failed");
    expect(logged).not.toContain(TOKEN);
  });

  it("reports error, not a crash, on an unexpected row shape", async () => {
    silence();
    const { client } = lookupClient({ data: { id: "x" }, error: null });
    await expect(lookupClaimEntry(client, TOKEN)).resolves.toEqual({
      kind: "error",
    });
  });
});

describe("claimRosterEntry", () => {
  it("calls the rpc with the token hash and the verified user id only", async () => {
    silence();
    const { client, rpc } = rpcClient({ data: [claimedRow], error: null });
    await claimRosterEntry(client, { authUserId: USER, token: TOKEN });
    expect(rpc).toHaveBeenCalledWith("claim_roster_entry", {
      p_token_hash: hashClaimToken(TOKEN),
      p_auth_user_id: USER,
    });
  });

  it("returns ids from the roster row on success", async () => {
    silence();
    const { client } = rpcClient({ data: [claimedRow], error: null });
    await expect(
      claimRosterEntry(client, { authUserId: USER, token: TOKEN }),
    ).resolves.toEqual({
      kind: "claimed",
      residentId: ID,
      communityId: ID,
      spaceId: null,
    });
  });

  it.each([
    "invalid",
    "already_claimed",
    "expired",
    "revoked",
    "bound_to_other_user",
  ] as const)("surfaces a refused '%s' outcome", async (outcome) => {
    silence();
    const { client } = rpcClient({
      data: [
        {
          ...claimedRow,
          claim_outcome: outcome,
          claimed_resident_id: null,
          claimed_community_id: null,
        },
      ],
      error: null,
    });
    await expect(
      claimRosterEntry(client, { authUserId: USER, token: TOKEN }),
    ).resolves.toEqual({ kind: "refused", outcome });
  });

  it("treats a 'claimed' outcome with no ids as an error", async () => {
    silence();
    const { client } = rpcClient({
      data: [{ ...claimedRow, claimed_resident_id: null }],
      error: null,
    });
    await expect(
      claimRosterEntry(client, { authUserId: USER, token: TOKEN }),
    ).resolves.toEqual({ kind: "error" });
  });

  it("returns error for a database error and a malformed response", async () => {
    silence();
    const failing = rpcClient({
      data: null,
      error: { message: "fk", code: "23503" },
    });
    await expect(
      claimRosterEntry(failing.client, { authUserId: USER, token: TOKEN }),
    ).resolves.toEqual({ kind: "error" });
    const malformed = rpcClient({
      data: [{ claim_outcome: "??" }],
      error: null,
    });
    await expect(
      claimRosterEntry(malformed.client, { authUserId: USER, token: TOKEN }),
    ).resolves.toEqual({ kind: "error" });
  });

  it("never logs the plaintext token", async () => {
    const spies = silence();
    const { client } = rpcClient({
      data: null,
      error: { message: `oops ${TOKEN}` },
    });
    await claimRosterEntry(client, { authUserId: USER, token: TOKEN });
    const everything = [spies.info, spies.warn, spies.error]
      .flatMap((spy) => spy.mock.calls.flat())
      .join("\n");
    expect(everything).not.toContain(TOKEN);
  });
});

describe("prepareNoEmailSignIn", () => {
  function adminClient(opts: {
    create?: { error: { code?: string; message: string } | null };
    link?: {
      data: { properties: { hashed_token?: string } | null };
      error: unknown;
    };
  }) {
    const createUser = vi
      .fn()
      .mockResolvedValue(opts.create ?? { error: null });
    const generateLink = vi.fn().mockResolvedValue(
      opts.link ?? {
        data: { properties: { hashed_token: "hashed" } },
        error: null,
      },
    );
    return {
      client: {
        auth: { admin: { createUser, generateLink } },
      } as unknown as SupabaseClient,
      createUser,
      generateLink,
    };
  }

  it("creates a confirmed synthetic user and returns the hashed token", async () => {
    const { client, createUser, generateLink } = adminClient({});
    await expect(prepareNoEmailSignIn(client, ID)).resolves.toEqual({
      kind: "ready",
      tokenHash: "hashed",
    });
    const email = `roster-${ID}@no-email.nivas.invalid`;
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email, email_confirm: true }),
    );
    expect(generateLink).toHaveBeenCalledWith({ type: "magiclink", email });
  });

  it("continues when the synthetic user already exists (a reissued link)", async () => {
    const { client } = adminClient({
      create: { error: { code: "email_exists", message: "exists" } },
    });
    await expect(prepareNoEmailSignIn(client, ID)).resolves.toMatchObject({
      kind: "ready",
    });
  });

  it("fails on any other create error", async () => {
    silence();
    const { client, generateLink } = adminClient({
      create: { error: { code: "unexpected_failure", message: "nope" } },
    });
    await expect(prepareNoEmailSignIn(client, ID)).resolves.toEqual({
      kind: "error",
    });
    expect(generateLink).not.toHaveBeenCalled();
  });

  it("fails when generateLink errors or returns no token", async () => {
    silence();
    const errored = adminClient({
      link: { data: { properties: null }, error: { message: "x" } },
    });
    await expect(prepareNoEmailSignIn(errored.client, ID)).resolves.toEqual({
      kind: "error",
    });
    const empty = adminClient({
      link: { data: { properties: {} }, error: null },
    });
    await expect(prepareNoEmailSignIn(empty.client, ID)).resolves.toEqual({
      kind: "error",
    });
  });
});

describe("log scrubbing", () => {
  it("removes emails and tokens from text", () => {
    expect(scrubSensitive(`user asha@example.com token ${TOKEN}`)).toBe(
      "user [email] token [token]",
    );
  });

  it("describes plain, Supabase-shaped and unknown errors without leaking", () => {
    expect(describeError(new Error("hi a@b.co"))).toMatchObject({
      errorMessage: "hi [email]",
    });
    expect(
      describeError({ message: "m", code: "c", status: 429 }),
    ).toMatchObject({
      errorCode: "c",
      errorStatus: 429,
    });
    expect(describeError("str")).toMatchObject({ errorName: "UnknownError" });
  });
});
