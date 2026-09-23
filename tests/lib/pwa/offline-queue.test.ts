import { afterEach, describe, expect, it, vi } from "vitest";

import {
  enqueueSubmission,
  flushQueue,
  getQueuedSubmissions,
  removeQueuedSubmission,
  type NewQueuedSubmission,
} from "@/lib/pwa/offline-queue";

// The environment-dependent halves of this module — the Background Sync
// request and the online/visibilitychange fallback listeners — need a
// real browser (or jsdom + fake events) to mean anything, and Phase
// 11.2's "manually test the offline-queue path on a real or throttled
// device" already owns that verification. These tests cover the
// deterministic part: storing, ordering, and retrying submissions.

function makeSubmission(
  overrides: Partial<NewQueuedSubmission> = {},
): NewQueuedSubmission {
  return {
    communityId: "community-1",
    text: "Streetlight out near Block C",
    photo: null,
    voiceNote: null,
    geo: { latitude: 28.4, longitude: 77.0 },
    ...overrides,
  };
}

afterEach(async () => {
  // Module-level IndexedDB connection is reused across tests (see
  // getDb()'s dbPromise cache) — clear rows rather than the connection.
  const remaining = await getQueuedSubmissions();
  await Promise.all(remaining.map((item) => removeQueuedSubmission(item.id)));
});

describe("enqueueSubmission / getQueuedSubmissions", () => {
  it("persists a submission and returns it oldest-first", async () => {
    const first = await enqueueSubmission(makeSubmission({ text: "first" }));
    const second = await enqueueSubmission(makeSubmission({ text: "second" }));

    const queued = await getQueuedSubmissions();

    expect(queued.map((item) => item.id)).toEqual([first.id, second.id]);
    expect(queued[0]?.status).toBe("pending");
    expect(queued[0]?.retryCount).toBe(0);
  });
});

describe("flushQueue", () => {
  it("removes a submission once it submits successfully", async () => {
    const record = await enqueueSubmission(makeSubmission());
    const submit = vi.fn().mockResolvedValue(true);

    await flushQueue(submit);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({ id: record.id }),
    );
    expect(await getQueuedSubmissions()).toHaveLength(0);
  });

  it("keeps a failed submission queued with an incremented retry count", async () => {
    await enqueueSubmission(makeSubmission());
    const submit = vi.fn().mockResolvedValue(false);

    await flushQueue(submit);

    const queued = await getQueuedSubmissions();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.status).toBe("failed");
    expect(queued[0]?.retryCount).toBe(1);
  });

  it("also retries (rather than drops) a submission whose submit call throws", async () => {
    await enqueueSubmission(makeSubmission());
    const submit = vi.fn().mockRejectedValue(new Error("network down"));

    await flushQueue(submit);

    const queued = await getQueuedSubmissions();
    expect(queued).toHaveLength(1);
    expect(queued[0]?.status).toBe("failed");
    expect(queued[0]?.retryCount).toBe(1);
  });

  it("processes queued submissions in creation order", async () => {
    await enqueueSubmission(makeSubmission({ text: "first" }));
    await enqueueSubmission(makeSubmission({ text: "second" }));
    const seenTexts: (string | null)[] = [];
    const submit = vi.fn().mockImplementation(async (item) => {
      seenTexts.push(item.text);
      return true;
    });

    await flushQueue(submit);

    expect(seenTexts).toEqual(["first", "second"]);
  });

  it("guards against overlapping flushes racing the same rows", async () => {
    await enqueueSubmission(makeSubmission());
    let resolveSubmit: (value: boolean) => void = () => undefined;
    const submit = vi.fn().mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveSubmit = resolve;
        }),
    );

    const firstFlush = flushQueue(submit);
    const secondFlush = flushQueue(submit); // fired while the first is still in-flight

    // submit() sits behind several real IndexedDB round-trips, so wait for
    // it to actually be invoked before resolving it — otherwise this
    // resolves a stale reference to the initial no-op closure.
    await vi.waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    resolveSubmit(true);
    await Promise.all([firstFlush, secondFlush]);

    // A second overlapping call must not re-process the same pending item.
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

describe("removeQueuedSubmission", () => {
  it("removes exactly the requested submission", async () => {
    const keep = await enqueueSubmission(makeSubmission({ text: "keep" }));
    const drop = await enqueueSubmission(makeSubmission({ text: "drop" }));

    await removeQueuedSubmission(drop.id);

    const queued = await getQueuedSubmissions();
    expect(queued.map((item) => item.id)).toEqual([keep.id]);
  });
});
