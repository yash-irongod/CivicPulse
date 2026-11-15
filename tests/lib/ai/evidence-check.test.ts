import { afterEach, describe, expect, it, vi } from "vitest";

import { checkResolutionEvidence } from "../../../lib/ai/evidence-check";
import * as provider from "../../../lib/ai/provider";

describe("checkResolutionEvidence", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles consistent resolution evidence", async () => {
    const mockResponse = JSON.stringify({
      consistent: true,
      confidence: 0.92,
      reasoning:
        "The after photo shows the leaking joint replaced with new pipe fixture.",
    });

    vi.spyOn(provider, "callModel").mockResolvedValue(mockResponse);

    const result = await checkResolutionEvidence({
      originalDescription: "Pipe burst in staircase",
      afterPhotoBase64: "fakebase64",
      afterPhotoMimeType: "image/jpeg",
      staffNote: "Replaced PVC pipe section",
    });

    expect(result).toEqual({
      consistent: true,
      confidence: 0.92,
      reasoning:
        "The after photo shows the leaking joint replaced with new pipe fixture.",
    });
  });

  it("handles inconsistent resolution evidence", async () => {
    const mockResponse = JSON.stringify({
      consistent: false,
      confidence: 0.88,
      reasoning: "The after photo still shows stagnant water around the drain.",
    });

    vi.spyOn(provider, "callModel").mockResolvedValue(mockResponse);

    const result = await checkResolutionEvidence({
      originalDescription: "Drain clogged",
      afterPhotoBase64: "fakebase64",
      afterPhotoMimeType: "image/jpeg",
      staffNote: "Cleared",
    });

    expect(result.consistent).toBe(false);
    expect(result.confidence).toBe(0.88);
  });

  it("handles malformed JSON without throwing", async () => {
    vi.spyOn(provider, "callModel").mockResolvedValue("Broken raw output");

    const result = await checkResolutionEvidence({
      originalDescription: "Light bulb broken",
      afterPhotoBase64: "fakebase64",
      afterPhotoMimeType: "image/jpeg",
    });

    expect(result.consistent).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain("not valid JSON");
  });

  it("handles AI provider error / timeout gracefully", async () => {
    vi.spyOn(provider, "callModel").mockRejectedValue(
      new provider.AiUnavailableError("evidence-check", "timeout", "Timed out"),
    );

    const result = await checkResolutionEvidence({
      originalDescription: "Gate broken",
      afterPhotoBase64: "fakebase64",
      afterPhotoMimeType: "image/jpeg",
    });

    expect(result.consistent).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.reasoning).toContain("unavailable");
  });
});
