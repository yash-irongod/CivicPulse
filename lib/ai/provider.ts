// AI Provider Abstraction (Task 5.1, §5, §10).
// Wraps Google Gemini behind an env-driven interface with strict timeouts,
// structured error logging, and graceful fallbacks.
// NEVER hardcodes model names or SDK calls in route handlers.

import { describeError, logEvent } from "../auth/log";

export type AiTask = "classify" | "dedup-embed" | "evidence-check";

export class AiUnavailableError extends Error {
  readonly task: AiTask;
  readonly reason: "timeout" | "missing_key" | "api_error" | "rate_limited";

  constructor(
    task: AiTask,
    reason: "timeout" | "missing_key" | "api_error" | "rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "AiUnavailableError";
    this.task = task;
    this.reason = reason;
  }
}

export interface ModelPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
}

export interface ModelCallInput {
  systemInstruction?: string;
  parts: ModelPart[];
  responseMimeType?: "application/json" | "text/plain";
  temperature?: number;
  timeoutMs?: number;
}

export interface EmbedCallInput {
  text: string;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

function getApiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.trim() === "") {
    throw new AiUnavailableError(
      "classify",
      "missing_key",
      "GEMINI_API_KEY is not configured",
    );
  }
  return key.trim();
}

export function getModelForTask(task: AiTask): string {
  if (task === "classify" || task === "dedup-embed") {
    return process.env.GEMINI_MODEL_CLASSIFY || "gemini-2.5-flash-lite";
  }
  return process.env.GEMINI_MODEL_MULTIMODAL || "gemini-2.5-flash";
}

/**
 * Universal model caller for Nivas intelligence layer.
 * Calls Gemini REST API directly without heavyweight SDK dependencies.
 */
export async function callModel(
  task: AiTask,
  input: ModelCallInput,
): Promise<string> {
  const apiKey = getApiKey();
  const model = getModelForTask(task);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const contents = [
    {
      role: "user",
      parts: input.parts.map((part) => {
        if (part.inlineData) {
          return {
            inline_data: {
              mime_type: part.inlineData.mimeType,
              data: part.inlineData.data,
            },
          };
        }
        return { text: part.text ?? "" };
      }),
    },
  ];

  const body: Record<string, unknown> = {
    contents,
    generationConfig: {
      temperature: input.temperature ?? 0.1,
      responseMimeType: input.responseMimeType ?? "application/json",
    },
  };

  if (input.systemInstruction) {
    body.systemInstruction = {
      parts: [{ text: input.systemInstruction }],
    };
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      if (res.status === 429) {
        throw new AiUnavailableError(
          task,
          "rate_limited",
          `Gemini rate limit exceeded: ${errText.slice(0, 200)}`,
        );
      }
      throw new AiUnavailableError(
        task,
        "api_error",
        `Gemini returned HTTP ${res.status}: ${errText.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string }>;
        };
      }>;
    };

    const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new AiUnavailableError(
        task,
        "api_error",
        "Gemini returned empty candidate content",
      );
    }

    return text;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof AiUnavailableError) {
      logEvent("warn", "ai.unavailable", {
        task,
        reason: error.reason,
        message: error.message,
      });
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      logEvent("warn", "ai.timeout", { task, timeoutMs });
      throw new AiUnavailableError(
        task,
        "timeout",
        `Gemini call timed out after ${timeoutMs}ms`,
      );
    }

    logEvent("error", "ai.call_failed", describeError(error));
    throw new AiUnavailableError(
      task,
      "api_error",
      error instanceof Error ? error.message : "Unknown AI provider error",
    );
  }
}

/**
 * Generate text embedding vector (768-dim) for semantic duplicate detection.
 */
export async function callEmbedding(
  task: AiTask,
  input: EmbedCallInput,
): Promise<number[]> {
  const apiKey = getApiKey();
  const model = "text-embedding-004";
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent?key=${apiKey}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: `models/${model}`,
        content: {
          parts: [{ text: input.text }],
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new AiUnavailableError(
        task,
        "api_error",
        `Gemini embedding returned ${res.status}: ${errText.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      embedding?: { values?: number[] };
    };

    const values = json.embedding?.values;
    if (!values || values.length === 0) {
      throw new AiUnavailableError(
        task,
        "api_error",
        "Gemini returned empty embedding values",
      );
    }

    return values;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof AiUnavailableError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiUnavailableError(task, "timeout", "Embedding timed out");
    }
    throw new AiUnavailableError(
      task,
      "api_error",
      error instanceof Error ? error.message : "Unknown embedding error",
    );
  }
}
