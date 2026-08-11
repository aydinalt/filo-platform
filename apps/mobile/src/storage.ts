import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { mergeLocationQueue, removeLocationEvents, takeLocationBatch, type QueuedLocation } from "./queue";

const CREDENTIAL_KEY = "filo.mobile.credential";
const QUEUE_KEY = "filo.mobile.locations";
let queueMutation: Promise<unknown> = Promise.resolve();

export const credentialStore = {
  read: () => SecureStore.getItemAsync(CREDENTIAL_KEY),
  write: (credential: string) => SecureStore.setItemAsync(CREDENTIAL_KEY, credential),
  clear: () => SecureStore.deleteItemAsync(CREDENTIAL_KEY),
};

async function readQueueUnsafe(): Promise<QueuedLocation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as QueuedLocation[] : [];
  } catch {
    return [];
  }
}

export async function readQueue(): Promise<QueuedLocation[]> {
  await queueMutation;
  return readQueueUnsafe();
}

function mutateQueue<T>(mutation: (queue: QueuedLocation[]) => { queue: QueuedLocation[]; result: T }) {
  const operation = queueMutation.then(async () => {
    const next = mutation(await readQueueUnsafe());
    await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(next.queue));
    return next.result;
  });
  queueMutation = operation.then(() => undefined, () => undefined);
  return operation;
}

export async function enqueueLocations(events: QueuedLocation[]) {
  return mutateQueue((current) => {
    const queue = mergeLocationQueue(current, events);
    return { queue, result: queue.length };
  });
}

export async function peekBatch() {
  return takeLocationBatch(await readQueue());
}

export async function replaceQueue(queue: QueuedLocation[]) {
  return mutateQueue(() => ({ queue, result: undefined }));
}

export async function removeQueuedEvents(eventIds: string[]) {
  return mutateQueue((current) => {
    const queue = removeLocationEvents(current, eventIds);
    return { queue, result: queue.length };
  });
}
