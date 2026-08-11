import NetInfo from "@react-native-community/netinfo";
import * as Battery from "expo-battery";
import * as Location from "expo-location";
import { Platform } from "react-native";
import type { MobileHeartbeatInput } from "@filo/contracts";
import { mobileApi } from "./api";
import { BACKGROUND_LOCATION_TASK, MOBILE_APP_VERSION } from "./constants";
import { credentialStore, readQueue } from "./storage";

let lastHeartbeatAttemptAt = 0;

function normalizeNetworkType(value: string | null | undefined): MobileHeartbeatInput["networkType"] {
  if (value === "wifi" || value === "cellular" || value === "none" || value === "unknown") return value;
  return "other";
}

export async function collectMobileHeartbeat(lastErrorCode: string | null = null): Promise<MobileHeartbeatInput> {
  const [batteryLevel, lowPowerMode, connection, backgroundPermission, tracking, queue] = await Promise.all([
    Battery.getBatteryLevelAsync().catch(() => -1),
    Battery.isLowPowerModeEnabledAsync().catch(() => false),
    NetInfo.fetch(),
    Location.getBackgroundPermissionsAsync(),
    Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK).catch(() => false),
    readQueue(),
  ]);
  const permission = backgroundPermission.status === "granted"
    ? "granted_always"
    : backgroundPermission.status === "denied"
      ? "denied"
      : "unknown";
  return {
    appVersion: MOBILE_APP_VERSION,
    osVersion: `${Platform.OS} ${String(Platform.Version)}`,
    batteryPercent: batteryLevel < 0 ? null : Math.round(batteryLevel * 100),
    lowPowerMode,
    networkType: normalizeNetworkType(connection.type),
    permission,
    trackingState: lastErrorCode ? "error" : tracking ? "tracking" : "stopped",
    pendingLocationCount: queue.length,
    oldestQueuedAt: queue[0]?.recordedAt ?? null,
    lastErrorCode,
  };
}

export async function sendMobileHeartbeat(lastErrorCode: string | null = null) {
  const now = Date.now();
  if (!lastErrorCode && now - lastHeartbeatAttemptAt < 60_000) return true;
  lastHeartbeatAttemptAt = now;
  const credential = await credentialStore.read();
  if (!credential) return false;
  try {
    await mobileApi.heartbeat(credential, await collectMobileHeartbeat(lastErrorCode));
    return true;
  } catch {
    return false;
  }
}
