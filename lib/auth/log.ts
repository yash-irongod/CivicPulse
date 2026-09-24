// Structured logging for auth code (§9: every external call logs failures,
// none fail silently). One JSON object per line so Vercel's log drain and
// Sentry can parse it. Claim tokens and email addresses are scrubbed from
// error text because upstream error messages sometimes echo them.

type Level = "info" | "warn" | "error";
type Field = string | number | boolean | null | undefined;

const EMAIL_PATTERN = /[^\s@"'<>]+@[^\s@"'<>]+/g;
const TOKEN_PATTERN = /\b[0-9a-f]{64}\b/gi;

export function scrubSensitive(text: string): string {
  return text
    .replace(EMAIL_PATTERN, "[email]")
    .replace(TOKEN_PATTERN, "[token]");
}

export function describeError(error: unknown): Record<string, Field> {
  if (error instanceof Error) {
    const withCode = error as Error & { code?: unknown; status?: unknown };
    return {
      errorName: error.name,
      errorMessage: scrubSensitive(error.message).slice(0, 500),
      errorCode: typeof withCode.code === "string" ? withCode.code : undefined,
      errorStatus:
        typeof withCode.status === "number" ? withCode.status : undefined,
    };
  }
  if (typeof error === "object" && error !== null) {
    const record = error as Record<string, unknown>;
    return {
      errorName: "SupabaseError",
      errorMessage:
        typeof record.message === "string"
          ? scrubSensitive(record.message).slice(0, 500)
          : undefined,
      errorCode: typeof record.code === "string" ? record.code : undefined,
      errorStatus:
        typeof record.status === "number" ? record.status : undefined,
    };
  }
  return {
    errorName: "UnknownError",
    errorMessage: scrubSensitive(String(error)),
  };
}

export function logEvent(
  level: Level,
  event: string,
  fields: Record<string, Field> = {},
): void {
  const line = JSON.stringify({
    level,
    event,
    at: new Date().toISOString(),
    ...fields,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.info(line);
}
