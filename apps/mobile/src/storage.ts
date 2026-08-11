import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { mergeLocationQueue, takeLocationBatch, type QueuedLocation } from "./queue";

const CREDENTIAL_KEY = "filo.mobile.credential";
const QUEUE_KEY = "filo.mobile.locations";

export const credentialStore = {
  read: () => SecureStore.getItemAsync(CREDENTIAL_KEY),
  write: (credential: string) => SecureStore.setItemAsync(CREDENTIAL_KEY, credential),
  clear: () => SecureStore.deleteItemAsync(CREDENTIAL_KEY),
};

export async function readQueue(): Promise<QueuedLocation[]> {
  const raw = await AsyncStorage.getItem(QUEUE_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed as QueuedLocation[] : [];
  } catch {
    return [];
  }
}

export async function enqueueLocations(events: QueuedLocation[]) {
  const queue = mergeLocationQueue(await readQueue(), events);
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  return queue.length;
}

export async function peekBatch() {
  return takeLocationBatch(await readQueue());
}

export async function replaceQueue(queue: QueuedLocation[]) {
  await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
}
