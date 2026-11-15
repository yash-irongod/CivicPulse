// Demo mode detection — DEVELOPMENT AND TEST ONLY.
// In production (NODE_ENV === "production"), demo mode is NEVER active,
// regardless of environment variable values. This prevents any demo fallback
// data from being served to real users.

export function isDemoMode(): boolean {
  const env = process.env.NODE_ENV;

  // Production is never demo mode. Period.
  if (env === "production") return false;

  // In test, demo mode is off by default (tests should mock Supabase).
  if (env === "test") return false;

  // In development, demo mode is only active if explicitly opted in.
  if (process.env.DEMO_MODE === "true") return true;

  return false;
}
