// Node has no native IndexedDB — lib/pwa/offline-queue.ts is written
// against the real browser API, so tests polyfill it rather than mocking
// the module itself. This keeps the test exercising the actual `idb`
// code path a browser would run.
import "fake-indexeddb/auto";
