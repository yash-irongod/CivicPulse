import { openDB, type DBSchema, type IDBPDatabase } from "idb";

import { BACKGROUND_SYNC_TAG, requestBackgroundSync } from "./register";

const DB_NAME = "nivas-offline-queue";
const DB_VERSION = 1;
const STORE_NAME = "submissions";

export type QueuedSubmissionStatus = "pending" | "syncing" | "failed";

export interface QueuedSubmissionGeo {
  latitude: number;
  longitude: number;
}

/**
 * One pending issue-report submission (§6.10 / Phase 8.2's report
 * composer). `photo`/`voiceNote` are stored as Blobs — IndexedDB can hold
 * these directly, no base64 round-trip needed.
 */
export interface QueuedSubmission {
  id: string;
  communityId: string;
  text: string | null;
  photo: Blob | null;
  voiceNote: Blob | null;
  geo: QueuedSubmissionGeo | null;
  createdAt: number;
  status: QueuedSubmissionStatus;
  retryCount: number;
}

export type NewQueuedSubmission = Omit<
  QueuedSubmission,
  "id" | "createdAt" | "status" | "retryCount"
>;

interface OfflineQueueSchema extends DBSchema {
  [STORE_NAME]: {
    key: string;
    value: QueuedSubmission;
    indexes: { "by-created-at": number };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineQueueSchema>> | null = null;

function getDb(): Promise<IDBPDatabase<OfflineQueueSchema>> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(
      new Error("[nivas][pwa] IndexedDB is unavailable in this environment."),
    );
  }

  dbPromise ??= openDB<OfflineQueueSchema>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex("by-created-at", "createdAt");
    },
  });

  return dbPromise;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback for older WebViews without crypto.randomUUID.
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// Two submissions queued within the same millisecond would otherwise get
// an identical `createdAt`, making the "by-created-at" index's order
// unreliable for them — a resident can plausibly fire off two reports in
// quick succession right before losing signal. Monotonically increasing
// this instead of using a bare Date.now() keeps flush order (and the
// test asserting it) deterministic.
let lastTimestamp = 0;
function nextTimestamp(): number {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
}

/**
 * Persists a submission locally and requests a Background Sync wake-up.
 * Called from the report composer (Phase 8.2) whenever a submission can't
 * reach the API immediately — not only when `navigator.onLine` is false,
 * since a flaky connection can fail a fetch while the browser still
 * reports itself online.
 */
export async function enqueueSubmission(
  submission: NewQueuedSubmission,
): Promise<QueuedSubmission> {
  const record: QueuedSubmission = {
    ...submission,
    id: generateId(),
    createdAt: nextTimestamp(),
    status: "pending",
    retryCount: 0,
  };

  const db = await getDb();
  await db.add(STORE_NAME, record);

  await requestFlushOnReconnect();

  return record;
}

/** Oldest-first, so a later flush submits reports in the order they were made. */
export async function getQueuedSubmissions(): Promise<QueuedSubmission[]> {
  const db = await getDb();
  return db.getAllFromIndex(STORE_NAME, "by-created-at");
}

export async function removeQueuedSubmission(id: string): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, id);
}

async function updateSubmission(
  id: string,
  patch: Partial<Pick<QueuedSubmission, "status" | "retryCount">>,
): Promise<void> {
  const db = await getDb();
  const existing = await db.get(STORE_NAME, id);
  if (existing === undefined) {
    return;
  }
  await db.put(STORE_NAME, { ...existing, ...patch });
}

/**
 * The real network call for one submission. Deliberately owned by the
 * caller (Phase 8.2, against Phase 4.1's not-yet-built endpoint) rather
 * than this module — this queue only knows how to store, order, and
 * retry, so wiring in the real endpoint later never requires touching
 * this file. Returning `false` (rather than throwing) means "try again
 * later"; throwing is treated the same way.
 */
export type SubmitQueuedSubmission = (
  submission: QueuedSubmission,
) => Promise<boolean>;

let activeFlush: Promise<void> | null = null;

/**
 * Attempts every pending submission in creation order. A success is
 * removed from the queue; a failure is left queued with an incremented
 * retry count for the next reconnect/visibility signal. Concurrency-
 * guarded because the service worker's sync signal, the `online`
 * listener, and the visibility fallback below can all fire within
 * moments of each other and must not race over the same IndexedDB rows.
 */
export async function flushQueue(
  submit: SubmitQueuedSubmission,
): Promise<void> {
  if (activeFlush !== null) {
    return activeFlush;
  }

  activeFlush = (async () => {
    const pending = (await getQueuedSubmissions()).filter(
      (item) => item.status !== "syncing",
    );

    for (const item of pending) {
      await updateSubmission(item.id, { status: "syncing" });
      try {
        const succeeded = await submit(item);
        if (succeeded) {
          await removeQueuedSubmission(item.id);
        } else {
          await updateSubmission(item.id, {
            status: "failed",
            retryCount: item.retryCount + 1,
          });
        }
      } catch (error) {
        console.error("[nivas][pwa] queued submission failed to send", error);
        await updateSubmission(item.id, {
          status: "failed",
          retryCount: item.retryCount + 1,
        });
      }
    }
  })();

  try {
    await activeFlush;
  } finally {
    activeFlush = null;
  }
}

async function requestFlushOnReconnect(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    await requestBackgroundSync(registration);
  } catch (error) {
    // No active service worker to ask — the online/visibilitychange
    // fallback registered by initOfflineQueueFallback() below still
    // covers this submission once the page reconnects.
    console.error(
      "[nivas][pwa] could not reach an active service worker to request sync",
      error,
    );
  }
}

let fallbackInitialized = false;

/**
 * Registers the non-Background-Sync fallback path: flush on the `online`
 * event and whenever the page becomes visible again. Call once, from
 * lib/pwa/register.ts's ServiceWorkerRegistrar. Idempotent, so a repeat
 * call (e.g. across a fast-refresh reload in dev) is a no-op.
 */
export function initOfflineQueueFallback(submit: SubmitQueuedSubmission): void {
  if (fallbackInitialized || typeof window === "undefined") {
    return;
  }
  fallbackInitialized = true;

  const tryFlush = (): void => {
    void flushQueue(submit);
  };

  window.addEventListener("online", tryFlush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      tryFlush();
    }
  });

  // Covers a queue left over from a previous session when the page loads
  // already online.
  if (navigator.onLine) {
    tryFlush();
  }
}

interface SyncFlushMessage {
  type: "nivas-sync-flush";
}

function isSyncFlushMessage(data: unknown): data is SyncFlushMessage {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: unknown }).type === "nivas-sync-flush"
  );
}

/**
 * Listens for the postMessage app/sw.ts sends when the Background Sync
 * API actually fires for BACKGROUND_SYNC_TAG. The worker only signals
 * "connectivity is back" — it deliberately does not perform the fetch
 * itself, so the real submission contract (Phase 4.1) is implemented once,
 * here, in the page context, rather than a second time inside the worker
 * script. Call once, alongside initOfflineQueueFallback().
 */
export function listenForServiceWorkerSyncSignal(
  submit: SubmitQueuedSubmission,
): void {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  navigator.serviceWorker.addEventListener("message", (event: MessageEvent) => {
    if (isSyncFlushMessage(event.data)) {
      void flushQueue(submit);
    }
  });
}

// Re-exported so callers wiring both halves of the sync story only need
// this module's import, not register.ts's too.
export { BACKGROUND_SYNC_TAG };
