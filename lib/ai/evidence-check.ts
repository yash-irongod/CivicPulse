// Resolution Evidence AI Check (Task 5.4, §6.7, §10).
// Compares before/after resolution evidence against the original report.
// Emits an advisory recommendation: never auto-resolves the incident independently.

import { z } from "zod";

import { describeError, logEvent } from "../auth/log";
import { callModel, type ModelPart } from "./provider";

export const evidenceCheckSchema = z.object({
  consistent: z.boolean(),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type EvidenceCheckResult = z.infer<typeof evidenceCheckSchema>;

export interface CheckResolutionInput {
  originalDescription: string;
  beforePhotoBase64?: string | null;
  beforePhotoMimeType?: string | null;
  afterPhotoBase64: string;
  afterPhotoMimeType: string;
  staffNote?: string | null;
}

const SYSTEM_INSTRUCTION = `You are a physical inspection reasoning AI for Nivas, assessing residential maintenance resolutions.
Compare the original issue report and "before" photo against the "after" photo and maintenance staff note.

Task:
Determine whether the "after" photo plausibly shows that the reported problem has been resolved.
For example:
- A reported water pipe leak should show a repaired, dry pipe or replaced fitting in the after photo.
- An overflowing garbage bin should show an empty, clean area in the after photo.
- An unlit hallway should show working illumination.

Output MUST be valid JSON:
{
  "consistent": true | false,
  "confidence": number between 0.0 and 1.0,
  "reasoning": "One concise, plain-language sentence explaining the visual observation."
}`;

export async function checkResolutionEvidence(
  input: CheckResolutionInput,
): Promise<EvidenceCheckResult> {
  const parts: ModelPart[] = [
    {
      text: `Original Problem Description: "${input.originalDescription}"\nStaff Resolution Note: "${input.staffNote || "None provided"}"`,
    },
  ];

  if (input.beforePhotoBase64 && input.beforePhotoMimeType) {
    parts.push({
      text: "BEFORE Photo (Reported Condition):",
    });
    parts.push({
      inlineData: {
        mimeType: input.beforePhotoMimeType,
        data: input.beforePhotoBase64,
      },
    });
  }

  parts.push({
    text: "AFTER Photo (Claimed Resolution):",
  });
  parts.push({
    inlineData: {
      mimeType: input.afterPhotoMimeType,
      data: input.afterPhotoBase64,
    },
  });

  try {
    const raw = await callModel("evidence-check", {
      systemInstruction: SYSTEM_INSTRUCTION,
      parts,
      responseMimeType: "application/json",
      temperature: 0.1,
    });

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(raw);
    } catch {
      logEvent("warn", "evidence_check.malformed_json", { response: raw });
      return {
        consistent: false,
        confidence: 0,
        reasoning: "AI model response was not valid JSON.",
      };
    }

    const validated = evidenceCheckSchema.safeParse(jsonParsed);
    if (!validated.success) {
      logEvent("warn", "evidence_check.schema_failed", {
        errors: JSON.stringify(validated.error.issues),
      });
      return {
        consistent: false,
        confidence: 0,
        reasoning: "AI response did not conform to evidence check schema.",
      };
    }

    return validated.data;
  } catch (error) {
    logEvent("error", "evidence_check.failed", describeError(error));
    return {
      consistent: false,
      confidence: 0,
      reasoning: "AI evidence check unavailable; requires manual inspection.",
    };
  }
}
