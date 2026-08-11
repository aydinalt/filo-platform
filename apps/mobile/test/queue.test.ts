import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mergeLocationQueue, takeLocationBatch } from "../src/queue";

const event = (eventId: string, recordedAt: string) => ({
  eventId,
  recordedAt,
  latitude: 41,
  longitude: 29,
  accuracyMeters: 10,
});

describe("mobile offline location queue", () => {
  it("deduplicates by event identity and preserves chronological order", () => {
    const result = mergeLocationQueue(
      [event("10000000-0000-4000-8000-000000000002", "2026-08-12T10:00:02.000Z")],
      [
        event("10000000-0000-4000-8000-000000000001", "2026-08-12T10:00:01.000Z"),
        event("10000000-0000-4000-8000-000000000002", "2026-08-12T10:00:02.000Z"),
      ],
    );
    assert.deepEqual(result.map((item) => item.eventId), [
      "10000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000002",
    ]);
  });

  it("takes bounded batches without dropping the remaining queue", () => {
    const queue = Array.from({ length: 105 }, (_, index) => event(
      `10000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      new Date(Date.UTC(2026, 7, 12, 10, 0, index)).toISOString(),
    ));
    const result = takeLocationBatch(queue);
    assert.equal(result.batch.length, 100);
    assert.equal(result.remaining.length, 5);
  });
});
