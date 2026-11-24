import { describe, expect, it } from "vitest";

import {
  MIN_SUPER_ADMIN_SECRET_LENGTH,
  SUPER_ADMIN_SESSION_TTL_SECONDS,
  isSuperAdminSecretValidConfig,
  signSuperAdminToken,
  verifySuperAdminPassphrase,
  verifySuperAdminToken,
} from "../../../lib/auth/super-admin";

const VALID_SECRET = "nivas-founder-secret-key-2026-ultra-safe";

describe("Founder Super Admin token & passphrase helpers", () => {
  it("fails closed when SUPER_ADMIN_SECRET is unset or too short", () => {
    expect(isSuperAdminSecretValidConfig(undefined)).toBe(false);
    expect(isSuperAdminSecretValidConfig("")).toBe(false);
    expect(
      isSuperAdminSecretValidConfig(
        "x".repeat(MIN_SUPER_ADMIN_SECRET_LENGTH - 1),
      ),
    ).toBe(false);
    expect(isSuperAdminSecretValidConfig(VALID_SECRET)).toBe(true);
  });

  it("verifies passphrases in constant time and refuses mismatched lengths", () => {
    expect(verifySuperAdminPassphrase(VALID_SECRET, VALID_SECRET)).toBe(true);
    expect(verifySuperAdminPassphrase("wrong", VALID_SECRET)).toBe(false);
    expect(
      verifySuperAdminPassphrase(`${VALID_SECRET}extra`, VALID_SECRET),
    ).toBe(false);
    expect(verifySuperAdminPassphrase("short-secret", "short-secret")).toBe(
      false,
    );
  });

  it("mints signed tokens that verify before expiry and fail on tampering or expiry", () => {
    const startMs = 1_700_000_000_000;
    const token = signSuperAdminToken(VALID_SECRET, startMs);

    expect(verifySuperAdminToken(token, VALID_SECRET, startMs + 5_000)).toBe(
      true,
    );

    // Expired after TTL
    expect(
      verifySuperAdminToken(
        token,
        VALID_SECRET,
        startMs + SUPER_ADMIN_SESSION_TTL_SECONDS * 1000 + 1,
      ),
    ).toBe(false);

    // Tampered token signature or payload
    const [payload, sig] = token.split(".");
    expect(
      verifySuperAdminToken(`${payload}a.${sig}`, VALID_SECRET, startMs + 100),
    ).toBe(false);
    expect(
      verifySuperAdminToken(`${payload}.${sig}x`, VALID_SECRET, startMs + 100),
    ).toBe(false);
    expect(
      verifySuperAdminToken(
        token,
        "different-founder-secret-key-2026-invalid",
        startMs + 100,
      ),
    ).toBe(false);
    expect(verifySuperAdminToken(undefined, VALID_SECRET, startMs)).toBe(false);
    expect(verifySuperAdminToken("malformed", VALID_SECRET, startMs)).toBe(
      false,
    );
  });

  it("throws when signing with an invalidly short secret", () => {
    expect(() => signSuperAdminToken("too-short")).toThrow();
  });
});
