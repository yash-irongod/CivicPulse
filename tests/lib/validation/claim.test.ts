import { describe, expect, it } from "vitest";

import {
  callbackQuerySchema,
  claimLookupRowSchema,
  claimRpcResultSchema,
  claimTokenSchema,
  claimWithoutEmailInputSchema,
  emailSchema,
  parseClaimPageQuery,
  rateLimitRpcResultSchema,
  requestClaimLinkInputSchema,
} from "../../../lib/validation/claim";

const TOKEN = "0123456789abcdef".repeat(4);
const ID = "3f2b8f0e-6a4e-4b7c-9d1a-2c5e7a8b9c01";

describe("claimTokenSchema", () => {
  it("accepts 64 lowercase hex characters", () => {
    expect(claimTokenSchema.parse(TOKEN)).toBe(TOKEN);
  });

  it("trims and lower-cases before validating", () => {
    expect(claimTokenSchema.parse(`  ${TOKEN.toUpperCase()}\n`)).toBe(TOKEN);
  });

  it.each([
    ["too short", TOKEN.slice(0, 63)],
    ["too long", `${TOKEN}0`],
    ["non-hex", `g${TOKEN.slice(1)}`],
    ["empty", ""],
    ["dashes (a raw uuid)", ID],
    ["sql fragment", "' or 1=1 --"],
  ])("rejects %s", (_label, value) => {
    expect(claimTokenSchema.safeParse(value).success).toBe(false);
  });

  it("rejects non-strings", () => {
    expect(claimTokenSchema.safeParse(null).success).toBe(false);
    expect(claimTokenSchema.safeParse(undefined).success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("normalises case and whitespace", () => {
    expect(emailSchema.parse("  Asha.Verma@Example.COM ")).toBe(
      "asha.verma@example.com",
    );
  });

  it.each(["", "asha", "asha@", "@example.com", "a b@example.com"])(
    "rejects %j",
    (value) => {
      expect(emailSchema.safeParse(value).success).toBe(false);
    },
  );

  it("rejects the reserved .invalid TLD, including our synthetic domain", () => {
    expect(emailSchema.safeParse("x@example.invalid").success).toBe(false);
    expect(emailSchema.safeParse("x@no-email.nivas.invalid").success).toBe(
      false,
    );
  });

  it("rejects addresses over 254 characters", () => {
    expect(
      emailSchema.safeParse(`${"a".repeat(250)}@example.com`).success,
    ).toBe(false);
  });
});

describe("form input schemas", () => {
  it("accepts a valid link request", () => {
    expect(
      requestClaimLinkInputSchema.parse({
        token: TOKEN,
        email: "a@b.co",
        lang: "hi",
      }),
    ).toEqual({ token: TOKEN, email: "a@b.co", lang: "hi" });
  });

  it("reports which field failed, so the action can pick the right message", () => {
    const result = requestClaimLinkInputSchema.safeParse({
      token: TOKEN,
      email: "nope",
      lang: "en",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0])).toContain("email");
      expect(result.error.issues.map((i) => i.path[0])).not.toContain("token");
    }
  });

  it("rejects an unsupported language", () => {
    expect(
      claimWithoutEmailInputSchema.safeParse({ token: TOKEN, lang: "fr" })
        .success,
    ).toBe(false);
  });

  it("requires both callback params", () => {
    expect(
      callbackQuerySchema.safeParse({ code: "abc", claim: TOKEN }).success,
    ).toBe(true);
    expect(
      callbackQuerySchema.safeParse({ code: "", claim: TOKEN }).success,
    ).toBe(false);
    expect(
      callbackQuerySchema.safeParse({ code: "abc", claim: "x" }).success,
    ).toBe(false);
    expect(
      callbackQuerySchema.safeParse({ code: null, claim: TOKEN }).success,
    ).toBe(false);
  });
});

describe("parseClaimPageQuery", () => {
  it("reads a well-formed query", () => {
    expect(
      parseClaimPageQuery({
        token: TOKEN,
        lang: "hi",
        error: "claim_failed",
        wait: "5",
      }),
    ).toEqual({
      token: TOKEN,
      lang: "hi",
      error: "claim_failed",
      waitMinutes: 5,
    });
  });

  it("takes the first value of a repeated param", () => {
    expect(parseClaimPageQuery({ token: [TOKEN, "other"] }).token).toBe(TOKEN);
  });

  it("ignores unrecognised lang, error and wait instead of failing", () => {
    const query = parseClaimPageQuery({
      token: TOKEN,
      lang: "fr",
      error: "link_used",
      wait: "0",
    });
    expect(query.lang).toBeUndefined();
    expect(query.error).toBeUndefined();
    expect(query.waitMinutes).toBeUndefined();
    expect(query.token).toBe(TOKEN);
  });

  it("caps wait at one day", () => {
    expect(parseClaimPageQuery({ wait: "1441" }).waitMinutes).toBeUndefined();
    expect(parseClaimPageQuery({ wait: "1440" }).waitMinutes).toBe(1440);
  });

  it("leaves token undefined when absent and truncates absurd lengths", () => {
    expect(parseClaimPageQuery({}).token).toBeUndefined();
    expect(parseClaimPageQuery({ token: "a".repeat(5000) }).token).toHaveLength(
      200,
    );
  });
});

describe("database result schemas", () => {
  it("accepts a claimed rpc row", () => {
    const parsed = claimRpcResultSchema.parse([
      {
        claim_outcome: "claimed",
        claimed_resident_id: ID,
        claimed_community_id: ID,
        claimed_space_id: null,
      },
    ]);
    expect(parsed[0]?.claim_outcome).toBe("claimed");
  });

  it("rejects an unknown outcome, an empty result and extra rows", () => {
    const row = {
      claim_outcome: "claimed",
      claimed_resident_id: ID,
      claimed_community_id: ID,
      claimed_space_id: null,
    };
    expect(
      claimRpcResultSchema.safeParse([{ ...row, claim_outcome: "maybe" }])
        .success,
    ).toBe(false);
    expect(claimRpcResultSchema.safeParse([]).success).toBe(false);
    expect(claimRpcResultSchema.safeParse([row, row]).success).toBe(false);
    expect(claimRpcResultSchema.safeParse(null).success).toBe(false);
  });

  it("accepts a lookup row with and without a space", () => {
    const base = {
      id: ID,
      status: "pending",
      claim_token_expires_at: "2026-10-01T00:00:00+00:00",
      display_name: "Asha Verma",
      preferred_language: "hi",
      communities: { name: "Green Park", default_language: "en" },
    };
    expect(
      claimLookupRowSchema.parse({ ...base, spaces: { name: "B-204" } }).spaces
        ?.name,
    ).toBe("B-204");
    expect(
      claimLookupRowSchema.parse({ ...base, spaces: null }).spaces,
    ).toBeNull();
  });

  it("rejects a lookup row missing its community", () => {
    expect(
      claimLookupRowSchema.safeParse({
        id: ID,
        status: "pending",
        claim_token_expires_at: null,
        display_name: "A",
        preferred_language: "en",
        spaces: null,
        communities: null,
      }).success,
    ).toBe(false);
  });

  it("validates the rate-limit rpc shape", () => {
    expect(
      rateLimitRpcResultSchema.safeParse([
        { allowed: true, remaining: 2, retry_after_seconds: 30 },
      ]).success,
    ).toBe(true);
    expect(
      rateLimitRpcResultSchema.safeParse([
        { allowed: "yes", remaining: 2, retry_after_seconds: 30 },
      ]).success,
    ).toBe(false);
  });
});
