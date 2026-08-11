import type { MobileDeviceHealth } from "@filo/contracts";

export type MobileHealthSignals = {
  lastHeartbeatAt: Date | null;
  permission: string | null;
  trackingState: string | null;
  pendingLocationCount: number;
  oldestQueuedAt: Date | null;
  lastErrorCode: string | null;
};

const OFFLINE_AFTER_MS = 10 * 60 * 1000;
const DELAYED_AFTER_MS = 5 * 60 * 1000;

export function classifyMobileDeviceHealth(
  signals: MobileHealthSignals,
  now = new Date(),
): MobileDeviceHealth {
  if (!signals.lastHeartbeatAt) return "never_seen";
  if (now.getTime() - signals.lastHeartbeatAt.getTime() > OFFLINE_AFTER_MS) return "offline";
  if (signals.permission && signals.permission !== "granted_always") return "permission_issue";
  if (signals.trackingState === "error" || signals.lastErrorCode) return "tracking_error";
  if (
    signals.pendingLocationCount > 0
    && signals.oldestQueuedAt
    && now.getTime() - signals.oldestQueuedAt.getTime() > DELAYED_AFTER_MS
  ) return "delayed";
  return signals.trackingState === "tracking" ? "healthy" : "idle";
}
