import { createHash } from "node:crypto";
import type {
  MobileDeviceHealth,
  MobileReleaseRolloutDevice,
  MobileReleaseRolloutHealth,
} from "@filo/contracts";

export type RolloutDeviceInput = Omit<MobileReleaseRolloutDevice, "rolloutBucket" | "eligible">;

export function mobileRolloutBucket(credentialId: string): number {
  const prefix = createHash("sha256").update(credentialId).digest("hex").slice(0, 8);
  return (Number.parseInt(prefix, 16) % 100) + 1;
}

export function assignMobileRolloutDevices(
  devices: RolloutDeviceInput[],
  targetPercentage: number,
): MobileReleaseRolloutDevice[] {
  const ranked = devices.map((device) => ({
    ...device,
    rolloutBucket: mobileRolloutBucket(device.credentialId),
    eligible: false,
  })).sort((left, right) =>
    left.rolloutBucket - right.rolloutBucket || left.credentialId.localeCompare(right.credentialId));
  const eligibleCount = ranked.length === 0
    ? 0
    : Math.max(1, Math.ceil((ranked.length * targetPercentage) / 100));
  return ranked.map((device, index) => ({ ...device, eligible: index < eligibleCount }));
}

function operationalHealth(health: MobileDeviceHealth) {
  return health === "healthy" || health === "idle";
}

export function assessMobileReleaseRollout(
  targetVersion: string,
  maxUnhealthyPercent: number,
  devices: MobileReleaseRolloutDevice[],
): MobileReleaseRolloutHealth {
  const eligible = devices.filter((device) => device.eligible);
  const observed = eligible.filter((device) => device.appVersion === targetVersion);
  const healthy = observed.filter((device) => operationalHealth(device.health));
  const unhealthyTargetDevices = observed.length - healthy.length;
  const unhealthyPercent = observed.length === 0
    ? 0
    : Math.round((unhealthyTargetDevices / observed.length) * 10000) / 100;
  const missing: string[] = [];
  if (eligible.length === 0) missing.push("Rollout için aktif mobil cihaz yok");
  if (observed.length < eligible.length) {
    missing.push(`${eligible.length - observed.length} seçili cihazdan hedef sürüm heartbeat'i eksik`);
  }
  if (unhealthyPercent > maxUnhealthyPercent) {
    missing.push(`Sağlıksız cihaz oranı %${unhealthyPercent}; eşik %${maxUnhealthyPercent}`);
  }
  return {
    eligibleDeviceCount: eligible.length,
    observedTargetDevices: observed.length,
    healthyTargetDevices: healthy.length,
    unhealthyTargetDevices,
    unhealthyPercent,
    maxUnhealthyPercent,
    readyToAdvance: eligible.length > 0 && observed.length === eligible.length
      && unhealthyPercent <= maxUnhealthyPercent,
    missing,
  };
}
