import type { MobileLocationBatchInput } from "@filo/contracts";

export type QueuedLocation = MobileLocationBatchInput["events"][number];

export function mergeLocationQueue(
  current: QueuedLocation[],
  incoming: QueuedLocation[],
  maximum = 1_000,
) {
  const byEvent = new Map<string, QueuedLocation>();
  for (const event of [...current, ...incoming]) byEvent.set(event.eventId, event);
  return [...byEvent.values()]
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))
    .slice(-maximum);
}

export function takeLocationBatch(queue: QueuedLocation[], maximum = 100) {
  return { batch: queue.slice(0, maximum), remaining: queue.slice(maximum) };
}
