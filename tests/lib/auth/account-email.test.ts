import { describe, expect, it } from "vitest";

import {
  buildFallbackSyntheticEmail,
  extractPublicEmail,
} from "../../../lib/auth/account-email";

describe("account email resolution helpers", () => {
  it("hides synthetic .invalid emails from UI and notifications", () => {
    expect(
      extractPublicEmail(
        "roster-3f2b8f0e-6a4e-4b7c-9d1a-2c5e7a8b9c01@no-email.nivas.invalid",
      ),
    ).toBeNull();
    expect(extractPublicEmail("no-email-user@example.invalid")).toBeNull();
    expect(extractPublicEmail("  ")).toBeNull();
    expect(extractPublicEmail(null)).toBeNull();
  });

  it("returns trimmed real emails cleanly", () => {
    expect(extractPublicEmail("  sharma@society.in  ")).toBe(
      "sharma@society.in",
    );
  });

  it("builds consistent synthetic fallback emails preferring roster entry ID", () => {
    const resId = "11111111-1111-1111-1111-111111111111";
    const entryId = "AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE";

    expect(buildFallbackSyntheticEmail(resId, entryId)).toBe(
      "roster-aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee@no-email.nivas.invalid",
    );
    expect(buildFallbackSyntheticEmail(resId, null)).toBe(
      `no-email-${resId}@no-email.nivas.invalid`,
    );
  });
});
