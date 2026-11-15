// AI Classification Service (Task 5.1, §6.7, §6.8, §10).
// Classifies issue reports into category and severity with bilingual support (Hindi, English, Hinglish).
// Below-threshold confidence routes to human triage rather than guessing wrong.

import { z } from "zod";

import { describeError, logEvent } from "../auth/log";
import { SEVERITY_VALUES, type Severity } from "../validation/transition";
import { callModel, type ModelPart } from "./provider";

export const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

export const rawClassificationSchema = z.object({
  category_id: z.string().nullable(),
  severity: z.enum(SEVERITY_VALUES),
  confidence: z.number().min(0).max(1),
  reasoning: z.string(),
});
export type RawClassification = z.infer<typeof rawClassificationSchema>;

export interface CategoryOption {
  id: string;
  name: string;
}

export interface ClassifyIssueInput {
  text?: string | null;
  transcript?: string | null;
  photoBase64?: string | null;
  photoMimeType?: string | null;
  categories: CategoryOption[];
  confidenceThreshold?: number;
}

export interface ClassificationResult {
  categoryId: string | null;
  severity: Severity;
  confidence: number;
  reasoning: string;
  needsHumanTriage: boolean;
}

const SYSTEM_INSTRUCTION = `You are the operations triage AI for Nivas, a residential community management platform.
Your task is to analyze resident incident reports and classify them into the appropriate category and severity.

Language Support:
- Resident reports may be written in English, Hindi (Devanagari), or Romanized Hindi/Hinglish (e.g., "Yeh garbage 3 din se nahi uthaya gaya", "Motor nahi chal rahi").
- Always understand all three forms accurately.

Severity Guidelines:
- critical: Immediate safety, structural, electrical hazards (sparking, exposed live wire, major flooding, gas smell). Target SLA: 4 hours.
- high: Major functional disruption (lift stuck/broken, water supply down, gate sensor failed). Target SLA: 24 hours.
- medium: Normal inconvenience or maintenance needs (overflowing dustbin, street lamp out, minor leak). Target SLA: 72 hours.
- low: Cosmetic or minor non-urgent issues (peeling paint in lobby, garden bench wobble). Target SLA: 7 days.

Decision Policy:
- If none of the available categories fit well, set category_id to null and confidence < 0.5.
- Output MUST be valid JSON adhering strictly to the schema.`;

export async function classifyIssue(
  input: ClassifyIssueInput,
): Promise<ClassificationResult> {
  const threshold = input.confidenceThreshold ?? DEFAULT_CONFIDENCE_THRESHOLD;

  const contentText = [input.text, input.transcript]
    .filter(Boolean)
    .join("\n\n");

  if (!contentText && !input.photoBase64) {
    return {
      categoryId: null,
      severity: "medium",
      confidence: 0,
      reasoning: "No textual or visual content provided to classify.",
      needsHumanTriage: true,
    };
  }

  const parts: ModelPart[] = [];

  if (contentText) {
    parts.push({
      text: `Available Categories:\n${JSON.stringify(input.categories, null, 2)}\n\nResident Report:\n"${contentText}"`,
    });
  } else {
    parts.push({
      text: `Available Categories:\n${JSON.stringify(input.categories, null, 2)}\n\nPlease classify based on the attached photo.`,
    });
  }

  if (input.photoBase64 && input.photoMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.photoMimeType,
        data: input.photoBase64,
      },
    });
  }

  try {
    const rawResponse = await callModel("classify", {
      systemInstruction: SYSTEM_INSTRUCTION,
      parts,
      responseMimeType: "application/json",
      temperature: 0.1,
    });

    let jsonParsed: unknown;
    try {
      jsonParsed = JSON.parse(rawResponse);
    } catch {
      logEvent("warn", "classify.malformed_json", { response: rawResponse });
      return {
        categoryId: null,
        severity: "medium",
        confidence: 0,
        reasoning: "AI model response was not valid JSON.",
        needsHumanTriage: true,
      };
    }

    const validated = rawClassificationSchema.safeParse(jsonParsed);
    if (!validated.success) {
      logEvent("warn", "classify.schema_validation_failed", {
        errors: JSON.stringify(validated.error.issues),
      });
      return {
        categoryId: null,
        severity: "medium",
        confidence: 0,
        reasoning:
          "AI model response did not conform to classification schema.",
        needsHumanTriage: true,
      };
    }

    const { category_id, severity, confidence, reasoning } = validated.data;
    const isKnownCategory = input.categories.some((c) => c.id === category_id);

    const meetsThreshold = confidence >= threshold && isKnownCategory;

    return {
      categoryId: meetsThreshold ? category_id : null,
      severity,
      confidence,
      reasoning,
      needsHumanTriage: !meetsThreshold,
    };
  } catch (error) {
    logEvent("error", "classify.failed", describeError(error));
    // AI failure must never crash or block intake (§10)
    return {
      categoryId: null,
      severity: "medium",
      confidence: 0,
      reasoning: "AI classification unavailable; queued for human triage.",
      needsHumanTriage: true,
    };
  }
}
