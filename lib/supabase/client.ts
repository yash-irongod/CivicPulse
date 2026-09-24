// Browser Supabase client (anon key; RLS applies). The two NEXT_PUBLIC_*
// variables are read as literal `process.env.NAME` expressions on purpose:
// Next.js inlines them into the browser bundle only in that exact form.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

export function createSupabaseBrowserClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set (see .env.example)",
    );
  }
  return createBrowserClient(url, anonKey);
}
