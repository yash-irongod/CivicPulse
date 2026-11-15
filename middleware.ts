// Next.js Middleware — Route protection and auth session refresh.
//
// This runs on every matching request BEFORE the route handler or page renders.
// It ensures:
// 1. Protected routes redirect unauthenticated users to the login page.
// 2. Supabase auth cookies are refreshed on every request.
//
// Note: Middleware cannot do deep role checks (it would need DB queries for
// memberships). Role enforcement is done in the layouts and API route handlers.
// Middleware only verifies that a valid Supabase session exists.

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

// Routes that require an authenticated session
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/incidents",
  "/analytics",
  "/map",
  "/teams",
  "/report",
  "/my-reports",
  "/notifications",
  "/maintenance",
];

// Routes that are always public (kept for documentation / future use)
const _PUBLIC_PATHS = [
  "/",
  "/auth/claim",
  "/auth/claim/done",
  "/auth/callback",
];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );
}

function _isPublicRoute(pathname: string): boolean {
  return _PUBLIC_PATHS.some(
    (path) => pathname === path || pathname.startsWith(path + "/"),
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip API routes (they have their own auth via requireRole), static assets, and Next.js internals
  if (
    pathname.startsWith("/api/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/serwist/") ||
    pathname.includes(".") // Static files like favicon.ico, manifest.json, etc.
  ) {
    return NextResponse.next();
  }

  // Create a response we can pass to the Supabase client for cookie refresh
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase isn't configured, protected routes should not be accessible
  if (!url || !anonKey) {
    if (isProtectedRoute(pathname)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return response;
  }

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Forward cookie updates to the request (for SSR)
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        // Forward cookie updates to the response (for the browser)
        response = NextResponse.next({
          request: { headers: request.headers },
        });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // Refresh the session — this updates auth cookies if needed
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // If the user is not authenticated and the route is protected, redirect to home
  if (!user && isProtectedRoute(pathname)) {
    const loginUrl = new URL("/auth/claim", request.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If the user IS authenticated and visits the home page, let them through
  // (the home page can show different content based on auth state)

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|json|txt|xml|webmanifest)$).*)",
  ],
};
