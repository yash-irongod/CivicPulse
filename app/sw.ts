/// <reference lib="esnext" />
/// <reference lib="webworker" />
import { defaultCache } from "@serwist/turbopack/worker";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { Serwist } from "serwist";

// This declares the value of `injectionPoint` to TypeScript. `injectionPoint`
// is the string @serwist/turbopack replaces with the real precache manifest.
declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

// Must match lib/pwa/register.ts's BACKGROUND_SYNC_TAG. Duplicated as a
// literal (rather than imported) because this file is compiled by
// Serwist's own esbuild step, a separate build from the main Next.js/
// Turbopack graph — see Task 1.4 notes on why an import wasn't used here.
const BACKGROUND_SYNC_TAG = "nivas-offline-queue-sync";

// `SyncEvent` and `ServiceWorkerGlobalScopeEventMap.sync` aren't in
// TypeScript's bundled webworker lib, but `serwist` (imported above)
// already globally declares both, so `event` below is correctly typed
// with no local declaration needed.

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: defaultCache,
});

serwist.addEventListeners();

// §6.10 / Task 1.4: on reconnect, this worker's only job is telling every
// open page that connectivity is back. It deliberately does not perform
// the queued submission's fetch itself — that would mean a second
// implementation of the multipart submission contract (Phase 4.1) living
// inside this worker script. lib/pwa/offline-queue.ts owns the one real
// implementation and flushes it in the page context on receiving this
// message; that same file's `online`/visibilitychange fallback covers
// browsers (notably iOS Safari) that never fire this event at all.
self.addEventListener("sync", (event) => {
  if (event.tag !== BACKGROUND_SYNC_TAG) {
    return;
  }

  event.waitUntil(
    (async (): Promise<void> => {
      const clients = await self.clients.matchAll({ type: "window" });
      for (const client of clients) {
        client.postMessage({ type: "nivas-sync-flush" });
      }
    })(),
  );
});
