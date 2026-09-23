"use client";

import { useEffect } from "react";

// The worker source (app/sw.ts) and the route that serves it
// (app/serwist/[path]/route.ts) are built by @serwist/turbopack, the
// current best-supported App-Router-compatible PWA tooling as of this
// build. Verified before choosing it: Turbopack (this project's pinned
// bundler, see package.json scripts) does not support the webpack-plugin
// approach older tools such as next-pwa relied on, and Serwist 9+ ships a
// dedicated Turbopack integration for exactly that reason
// (https://serwist.pages.dev/docs/next/turbo). This file only registers
// the worker that route serves; it does not build the worker itself.
export const SERVICE_WORKER_URL = "/serwist/sw.js";
export const SERVICE_WORKER_SCOPE = "/";

// Must match the tag app/sw.ts listens for on the `sync` event.
export const BACKGROUND_SYNC_TAG = "nivas-offline-queue-sync";

// `ServiceWorkerRegistration.sync` isn't in TypeScript's bundled DOM types,
// but `serwist` (already a project dependency — see app/sw.ts) globally
// augments ServiceWorkerRegistration with it, so no local declaration is
// needed here. The runtime feature-detection below still matters — the
// type existing doesn't mean the browser actually implements it.

/**
 * Registers the Nivas service worker. Safe to call in any environment —
 * resolves to null (never throws) when service workers aren't supported,
 * so callers never need their own feature-detection branch.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }

  try {
    return await navigator.serviceWorker.register(SERVICE_WORKER_URL, {
      scope: SERVICE_WORKER_SCOPE,
    });
  } catch (error) {
    // §9 Code Standards: no silent failures. A resident who can't get an
    // installed/offline-capable app must still be able to use the in-page
    // report flow, so this error is logged, never re-thrown.
    console.error("[nivas][pwa] service worker registration failed", error);
    return null;
  }
}

export function supportsBackgroundSync(
  registration: ServiceWorkerRegistration | null,
): registration is ServiceWorkerRegistration {
  return (
    registration !== null &&
    typeof window !== "undefined" &&
    "SyncManager" in window &&
    "sync" in registration
  );
}

/**
 * Asks the browser to wake the service worker (via the `sync` event, see
 * app/sw.ts) as soon as connectivity returns. Returns false — without
 * throwing — when Background Sync isn't available (notably iOS Safari),
 * so lib/pwa/offline-queue.ts's online/visibilitychange fallback is what
 * actually flushes the queue in that case.
 */
export async function requestBackgroundSync(
  registration: ServiceWorkerRegistration | null,
): Promise<boolean> {
  if (!supportsBackgroundSync(registration)) {
    return false;
  }

  try {
    await registration.sync.register(BACKGROUND_SYNC_TAG);
    return true;
  } catch (error) {
    console.error("[nivas][pwa] background sync registration failed", error);
    return false;
  }
}

/**
 * Mounted once from app/layout.tsx (a client component, since service
 * worker registration is a browser-only API). Renders nothing — its only
 * job is the registration side effect.
 */
export function ServiceWorkerRegistrar(): null {
  useEffect(() => {
    void registerServiceWorker();
  }, []);

  return null;
}
