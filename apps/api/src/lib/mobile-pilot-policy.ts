import type { MobilePilotConfiguration, MobilePilotPolicy } from "@filo/contracts";

export const DEFAULT_MOBILE_PILOT_POLICY: MobilePilotPolicy = {
  trackingEnabled: true,
  minimumAppVersion: null,
  heartbeatIntervalSeconds: 60,
  updatedAt: null,
};

export function compareReleaseVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  if (leftParts.length !== 3 || rightParts.length !== 3 || [...leftParts, ...rightParts].some(Number.isNaN)) {
    return -1;
  }
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index]! > rightParts[index]!) return 1;
    if (leftParts[index]! < rightParts[index]!) return -1;
  }
  return 0;
}

export function requiredMobileAction(
  policy: MobilePilotPolicy,
  appVersion: string | null,
): MobilePilotConfiguration["requiredAction"] {
  if (!policy.trackingEnabled) return "pause";
  if (policy.minimumAppVersion && (!appVersion || compareReleaseVersions(appVersion, policy.minimumAppVersion) < 0)) {
    return "upgrade";
  }
  return "none";
}
