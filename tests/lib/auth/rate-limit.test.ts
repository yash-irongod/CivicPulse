import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  checkRateLimit,
  enforceRateLimits,
  getClientIp,
  rateLimitKey,
  retryAfterMinutes,
  type LimitSpec,
} from "../../../lib/auth/rate-limit";

const SPEC: LimitSpec = { bucket: "test_bucket", limit: 3, windowSeconds: 60 };

function clientReturning(result: { data: unknown; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as SupabaseClient, rpc };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getClientIp", () => {
  const headers = (init: Record<string, string>) => new Headers(init);

  it("uses the first x-forwarded-for entry", () => {
    expect(
      getClientIp(headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" })),
    ).toBe("203.0.113.7");
  });

  it("accepts IPv6", () => {
    expect(getClientIp(headers({ "x-forwarded-for": "2001:db8::1" }))).toBe(
      "2001:db8::1",
    );
  });

  it("falls back to x-real-ip when x-forwarded-for is not an IP", () => {
    expect(
      getClientIp(
        headers({ "x-forwarded-for": "garbage", "x-real-ip": "198.51.100.4" }),
      ),
    ).toBe("198.51.100.4");
  });

  it("uses one shared 'unknown' bucket when nothing usable is present", () => {
    expect(getClientIp(headers({}))).toBe("unknown");
    expect(getClientIp(headers({ "x-forwarded-for": "not-an-ip" }))).toBe(
      "unknown",
    );
  });
});

describe("rateLimitKey", () => {
  it("is a deterministic 64-hex digest", () => {
    expect(rateLimitKey("a", "b")).toMatch(/^[0-9a-f]{64}$/);
    expect(rateLimitKey("a", "b")).toBe(rateLimitKey("a", "b"));
  });

  it("separates buckets and identifiers", () => {
    expect(rateLimitKey("a", "b")).not.toBe(rateLimitKey("c", "b"));
    expect(rateLimitKey("a", "b")).not.toBe(rateLimitKey("a", "c"));
  });

  it("does not let bucket/identifier boundaries collide", () => {
    expect(rateLimitKey("a:b", "c")).not.toBe(rateLimitKey("a", "b:c"));
  });

  it("never contains the raw identifier", () => {
    expect(rateLimitKey("claim_link_email", "asha@example.com")).not.toContain(
      "asha",
    );
  });
});

describe("checkRateLimit", () => {
  it("allows a call inside the limit and passes hashed args to the rpc", async () => {
    const { client, rpc } = clientReturning({
      data: [{ allowed: true, remaining: 2, retry_after_seconds: 60 }],
      error: null,
    });
    await expect(checkRateLimit(client, SPEC, "203.0.113.7")).resolves.toEqual({
      allowed: true,
      remaining: 2,
    });
    expect(rpc).toHaveBeenCalledWith("check_rate_limit", {
      p_key: rateLimitKey("test_bucket", "203.0.113.7"),
      p_limit: 3,
      p_window_seconds: 60,
    });
  });

  it("refuses over the limit and reports the retry delay", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = clientReturning({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 42 }],
      error: null,
    });
    await expect(checkRateLimit(client, SPEC, "x")).resolves.toEqual({
      allowed: false,
      reason: "limit",
      retryAfterSeconds: 42,
    });
  });

  it("never reports a retry delay below one second", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = clientReturning({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 0 }],
      error: null,
    });
    const result = await checkRateLimit(client, SPEC, "x");
    expect(result.allowed === false && result.retryAfterSeconds).toBe(1);
  });

  it("fails closed when the rpc errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = clientReturning({
      data: null,
      error: { message: "boom", code: "XX000" },
    });
    await expect(checkRateLimit(client, SPEC, "x")).resolves.toMatchObject({
      allowed: false,
      reason: "unavailable",
    });
  });

  it("fails closed on a malformed response", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = clientReturning({
      data: [{ allowed: "yes" }],
      error: null,
    });
    await expect(checkRateLimit(client, SPEC, "x")).resolves.toMatchObject({
      allowed: false,
      reason: "unavailable",
    });
  });

  it("fails closed when the rpc throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = {
      rpc: vi.fn().mockRejectedValue(new Error("network down")),
    } as unknown as SupabaseClient;
    await expect(checkRateLimit(client, SPEC, "x")).resolves.toMatchObject({
      allowed: false,
      reason: "unavailable",
    });
  });
});

describe("enforceRateLimits", () => {
  it("returns the lowest remaining count when every check passes", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({
        data: [{ allowed: true, remaining: 9, retry_after_seconds: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [{ allowed: true, remaining: 1, retry_after_seconds: 1 }],
        error: null,
      });
    const client = { rpc } as unknown as SupabaseClient;
    await expect(
      enforceRateLimits(client, [
        { spec: SPEC, identifier: "a" },
        { spec: SPEC, identifier: "b" },
      ]),
    ).resolves.toEqual({ allowed: true, remaining: 1 });
  });

  it("stops at the first refusal", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const rpc = vi.fn().mockResolvedValueOnce({
      data: [{ allowed: false, remaining: 0, retry_after_seconds: 5 }],
      error: null,
    });
    const client = { rpc } as unknown as SupabaseClient;
    const result = await enforceRateLimits(client, [
      { spec: SPEC, identifier: "a" },
      { spec: SPEC, identifier: "b" },
    ]);
    expect(result.allowed).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("retryAfterMinutes", () => {
  it("rounds up and never returns zero", () => {
    expect(retryAfterMinutes(1)).toBe(1);
    expect(retryAfterMinutes(60)).toBe(1);
    expect(retryAfterMinutes(61)).toBe(2);
    expect(retryAfterMinutes(0)).toBe(1);
  });
});
