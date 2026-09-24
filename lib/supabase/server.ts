// Server-side Supabase clients. Two, with very different trust levels:
//
//   createSupabaseServerClient()      cookie session + anon key. RLS applies to
//                                     everything it does. Use for anything that
//                                     acts AS the signed-in user.
//   createSupabaseServiceRoleClient() service_role key. BYPASSES RLS. Only for
//                                     trusted server code that derives its own
//                                     tenancy (e.g. the claim flow, which takes
//                                     community_id from the roster row, never
//                                     from client input).
//
// `server-only` makes importing this file from a client component a build
// error, so the service-role key cannot be bundled to the browser.

import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { z } from "zod";

const publicEnvSchema = z.object({
  url: z.url(),
  anonKey: z.string().min(1),
});

const serviceEnvSchema = publicEnvSchema.extend({
  serviceRoleKey: z.string().min(1),
});

function readPublicEnv(): z.infer<typeof publicEnvSchema> {
  const parsed = publicEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example)",
    );
  }
  return parsed.data;
}

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const { url, anonKey } = readPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Components cannot write cookies. Expected: session refresh
          // is done by the Phase 3.2 middleware, and Server Actions and Route
          // Handlers (which can write) are where sign-in happens.
        }
      },
    },
  });
}

export function createSupabaseServiceRoleClient(): SupabaseClient {
  const parsed = serviceEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (!parsed.success) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example)",
    );
  }

  return createClient(parsed.data.url, parsed.data.serviceRoleKey, {
    // A per-request client: it must never store or refresh a session.
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
