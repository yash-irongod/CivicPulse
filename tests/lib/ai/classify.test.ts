import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { classifyIssue } from "../../../lib/ai/classify";
import * as provider from "../../../lib/ai/provider";

describe("classifyIssue", () => {
  const categories = [
    { id: "cat-plumbing", name: "Plumbing" },
    { id: "cat-electrical", name: "Electrical" },
    { id: "cat-waste", name: "Waste Management" },
  ];

  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-fake-key";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("handles valid classification with high confidence", async () => {
    const mockResponse = JSON.stringify({
      category_id: "cat-electrical",
      severity: "critical",
      confidence: 0.95,
      reasoning:
        "Sparks flying from the main meter board is an immediate hazard.",
    });

    vi.spyOn(provider, "callModel").mockResolvedValue(mockResponse);

    const result = await classifyIssue({
      text: "Meter board se spark nikal raha hai, please check urgently!",
      categories,
    });

    expect(result).toEqual({
      categoryId: "cat-electrical",
      severity: "critical",
      confidence: 0.95,
      reasoning:
        "Sparks flying from the main meter board is an immediate hazard.",
      needsHumanTriage: false,
    });
  });

  it("routes to human triage when confidence is below threshold", async () => {
    const mockResponse = JSON.stringify({
      category_id: "cat-waste",
      severity: "low",
      confidence: 0.45,
      reasoning: "Unclear description, possibly garbage or garden litter.",
    });

    vi.spyOn(provider, "callModel").mockResolvedValue(mockResponse);

    const result = await classifyIssue({
      text: "Some issue near block A gate",
      categories,
      confidenceThreshold: 0.7,
    });

    expect(result.needsHumanTriage).toBe(true);
    expect(result.categoryId).toBeNull();
    expect(result.confidence).toBe(0.45);
  });

  it("handles malformed JSON from the model without crashing", async () => {
    vi.spyOn(provider, "callModel").mockResolvedValue("Not valid JSON here");

    const result = await classifyIssue({
      text: "Water leakage in flat 204",
      categories,
    });

    expect(result.needsHumanTriage).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.categoryId).toBeNull();
  });

  it("handles schema non-conformity gracefully", async () => {
    const badSchemaResponse = JSON.stringify({
      category_id: "cat-plumbing",
      severity: "unknown_severity_value",
      confidence: "not_a_number",
    });

    vi.spyOn(provider, "callModel").mockResolvedValue(badSchemaResponse);

    const result = await classifyIssue({
      text: "Tap leaking",
      categories,
    });

    expect(result.needsHumanTriage).toBe(true);
    expect(result.confidence).toBe(0);
  });

  it("handles AI provider timeout / unavailability without throwing", async () => {
    vi.spyOn(provider, "callModel").mockRejectedValue(
      new provider.AiUnavailableError(
        "classify",
        "timeout",
        "Model call timed out",
      ),
    );

    const result = await classifyIssue({
      text: "Pipe burst in basement",
      categories,
    });

    expect(result.needsHumanTriage).toBe(true);
    expect(result.confidence).toBe(0);
    expect(result.categoryId).toBeNull();
  });

  it("returns fallback triage immediately if no text or photo is provided", async () => {
    const spy = vi.spyOn(provider, "callModel");

    const result = await classifyIssue({
      text: "",
      transcript: null,
      categories,
    });

    expect(result.needsHumanTriage).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });
});
