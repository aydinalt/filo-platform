import * as Crypto from "expo-crypto";
import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import { mobileApi } from "./api";
import { BACKGROUND_LOCATION_TASK } from "./constants";
import { sendMobileHeartbeat } from "./diagnostics";
import { credentialStore, enqueueLocations, peekBatch, readQueue, removeQueuedEvents } from "./storage";

export { BACKGROUND_LOCATION_TASK } from "./constants";

export async function flushLocationQueue() {
  const credential = await credentialStore.read();
  if (!credential) return { sent: 0, queued: (await peekBatch()).batch.length };
  let sent = 0;
  while (true) {
    const { batch } = await peekBatch();
    if (batch.length === 0) return { sent, queued: 0 };
    try {
      await mobileApi.locations(credential, { events: batch });
      sent += batch.length;
      await removeQueuedEvents(batch.map((event) => event.eventId));
    } catch {
      return { sent, queued: (await readQueue()).length };
    }
  }
}

TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  if (error || !data) return;
  const locations = (data as { locations?: Location.LocationObject[] }).locations ?? [];
  await enqueueLocations(locations.map((location) => ({
    eventId: Crypto.randomUUID(),
    recordedAt: new Date(location.timestamp).toISOString(),
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    accuracyMeters: Math.min(5_000, Math.max(1, location.coords.accuracy ?? 100)),
    speedMps: location.coords.speed !== null && location.coords.speed >= 0
      ? Math.min(150, location.coords.speed)
      : null,
    headingDegrees: location.coords.heading !== null && location.coords.heading >= 0
      ? location.coords.heading % 360
      : null,
  })));
  await flushLocationQueue();
  await sendMobileHeartbeat();
});

export async function startBackgroundTracking() {
  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== "granted") throw new Error("FOREGROUND_LOCATION_DENIED");
  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== "granted") throw new Error("BACKGROUND_LOCATION_DENIED");
  const running = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  if (!running) {
    await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
      accuracy: Location.Accuracy.High,
      timeInterval: 15_000,
      distanceInterval: 25,
      pausesUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle: "Filo vardiyası aktif",
        notificationBody: "Konum yalnız aktif vardiya süresince paylaşılıyor.",
        notificationColor: "#117d6b",
      },
    });
  }
}

export async function stopBackgroundTracking() {
  if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK)) {
    await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
  }
}
