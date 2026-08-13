import type { MobilePilotCohortDevice, MobilePilotCohortReadiness } from "@filo/contracts";

export const MOBILE_PILOT_COHORT_REQUIREMENTS = {
  ios: 1,
  android: 2,
  distinctAndroidModels: 2,
} as const;

function deviceFingerprint(device: Pick<MobilePilotCohortDevice, "deviceManufacturer" | "deviceModel">) {
  return `${device.deviceManufacturer.trim().toLocaleLowerCase("en-US")}:${device.deviceModel.trim().toLocaleLowerCase("en-US")}`;
}

export function assessMobilePilotCohort(
  targetVersion: string,
  devices: MobilePilotCohortDevice[],
): MobilePilotCohortReadiness {
  const eligible = devices.filter((device) => device.appVersion === targetVersion);
  const iosPassed = eligible.filter((device) => device.platform === "ios").length;
  const androidDevices = eligible.filter((device) => device.platform === "android");
  const androidPassed = androidDevices.length;
  const distinctAndroidModels = new Set(androidDevices.map(deviceFingerprint)).size;
  const missing: string[] = [];
  if (iosPassed < MOBILE_PILOT_COHORT_REQUIREMENTS.ios) {
    missing.push(`${MOBILE_PILOT_COHORT_REQUIREMENTS.ios - iosPassed} iPhone pilotu`);
  }
  if (androidPassed < MOBILE_PILOT_COHORT_REQUIREMENTS.android) {
    missing.push(`${MOBILE_PILOT_COHORT_REQUIREMENTS.android - androidPassed} Android pilotu`);
  }
  if (distinctAndroidModels < MOBILE_PILOT_COHORT_REQUIREMENTS.distinctAndroidModels) {
    missing.push(`${MOBILE_PILOT_COHORT_REQUIREMENTS.distinctAndroidModels - distinctAndroidModels} farklı Android/OEM modeli`);
  }
  return {
    targetVersion,
    iosPassed,
    androidPassed,
    distinctAndroidModels,
    requiredIos: MOBILE_PILOT_COHORT_REQUIREMENTS.ios,
    requiredAndroid: MOBILE_PILOT_COHORT_REQUIREMENTS.android,
    requiredDistinctAndroidModels: MOBILE_PILOT_COHORT_REQUIREMENTS.distinctAndroidModels,
    ready: missing.length === 0,
    missing,
    devices: eligible,
  };
}
