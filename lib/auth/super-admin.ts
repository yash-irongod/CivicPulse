// Pure Founder Super Admin token & passphrase verification helpers.
// Zero Next.js I/O here so unit tests run directly with node:crypto.

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

export const SUPER_ADMIN_COOKIE_NAME = "nivas_super_admin";
export const MIN_SUPER_ADMIN_SECRET_LENGTH = 24;
export const SUPER_ADMIN_SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

interface SuperAdminPayload {
  exp: number;
  jti: string;
}

function sha256Buffer(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function deriveSigningKey(secret: string): Buffer {
  return createHmac("sha256", "nivas-super-admin-cookie-key-v1")
    .update(secret, "utf8")
    .digest();
}

export function isSuperAdminSecretValidConfig(
  secret: string | undefined,
): secret is string {
  return (
    typeof secret === "string" &&
    secret.trim().length >= MIN_SUPER_ADMIN_SECRET_LENGTH
  );
}

/**
 * Constant-time passphrase verification hashed through SHA-256 so input
 * length never leaks over timing side channels. Fails closed if misconfigured.
 */
export function verifySuperAdminPassphrase(
  candidate: string,
  configuredSecret: string | undefined,
): boolean {
  if (!isSuperAdminSecretValidConfig(configuredSecret)) {
    return false;
  }
  const candidateDigest = sha256Buffer(candidate);
  const expectedDigest = sha256Buffer(configuredSecret.trim());
  return timingSafeEqual(candidateDigest, expectedDigest);
}

export function signSuperAdminToken(
  configuredSecret: string,
  nowMs: number = Date.now(),
): string {
  if (!isSuperAdminSecretValidConfig(configuredSecret)) {
    throw new Error("SUPER_ADMIN_SECRET is missing or too short");
  }
  const payload: SuperAdminPayload = {
    exp: nowMs + SUPER_ADMIN_SESSION_TTL_SECONDS * 1000,
    jti: randomBytes(16).toString("hex"),
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  const signature = createHmac(
    "sha256",
    deriveSigningKey(configuredSecret.trim()),
  )
    .update(encodedPayload, "utf8")
    .digest("base64url");

  return `${encodedPayload}.${signature}`;
}

export function verifySuperAdminToken(
  token: string | undefined | null,
  configuredSecret: string | undefined,
  nowMs: number = Date.now(),
): boolean {
  if (!token || !isSuperAdminSecretValidConfig(configuredSecret)) {
    return false;
  }
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [encodedPayload, providedSig] = parts;
  if (!encodedPayload || !providedSig) return false;

  const expectedSig = createHmac(
    "sha256",
    deriveSigningKey(configuredSecret.trim()),
  )
    .update(encodedPayload, "utf8")
    .digest("base64url");

  const providedBuf = Buffer.from(providedSig, "utf8");
  const expectedBuf = Buffer.from(expectedSig, "utf8");
  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }
  if (!timingSafeEqual(providedBuf, expectedBuf)) {
    return false;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<SuperAdminPayload>;
    return (
      typeof parsed.exp === "number" &&
      Number.isFinite(parsed.exp) &&
      parsed.exp > nowMs &&
      typeof parsed.jti === "string" &&
      parsed.jti.length >= 16
    );
  } catch {
    return false;
  }
}
