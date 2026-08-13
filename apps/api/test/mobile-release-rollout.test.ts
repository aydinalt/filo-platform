import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMobileReleaseRolloutSchema,
  mobileReleaseRolloutActionSchema,
  type MobileReleaseRolloutDevice,
} from "@filo/contracts";
import {
  assessMobileReleaseRollout,
  assignMobileRolloutDevices,
  mobileRolloutBucket,
  type RolloutDeviceInput,
} from "../src/lib/mobile-release-rollout.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

function device(id: string, appVersion: string | null, health: RolloutDeviceInput["health"]): RolloutDeviceInput {
  return {
    credentialId: id,
    deviceName: `Cihaz ${id.slice(-1)}`,
    platform: "android",
    deviceManufacturer: "Samsung",
    deviceModel: `Model-${id.slice(-1)}`,
    appVersion,
    health,
  };
}

test("assigns a stable non-empty first rollout cohort and expands to every device", () => {
  const input = [
    device("10000000-0000-4000-8000-000000000001", "0.96.0", "healthy"),
    device("10000000-0000-4000-8000-000000000002", "0.96.0", "healthy"),
    device("10000000-0000-4000-8000-000000000003", "0.96.0", "healthy"),
  ];
  const first = assignMobileRolloutDevices(input, 10);
  const repeated = assignMobileRolloutDevices(input, 10);
  assert.equal(first.filter((item) => item.eligible).length, 1);
  assert.deepEqual(first, repeated);
  assert.equal(assignMobileRolloutDevices(input, 100).every((item) => item.eligible), true);
  assert.equal(mobileRolloutBucket(input[0]!.credentialId), first.find((item) => item.credentialId === input[0]!.credentialId)!.rolloutBucket);
});

test("blocks stage advance when target-version devices exceed the unhealthy threshold", () => {
  const devices: MobileReleaseRolloutDevice[] = [
    { ...device("10000000-0000-4000-8000-000000000001", "0.97.0", "healthy"), rolloutBucket: 1, eligible: true },
    { ...device("10000000-0000-4000-8000-000000000002", "0.97.0", "tracking_error"), rolloutBucket: 2, eligible: true },
  ];
  const blocked = assessMobileReleaseRollout("0.97.0", 10, devices);
  assert.equal(blocked.unhealthyPercent, 50);
  assert.equal(blocked.readyToAdvance, false);
  assert.match(blocked.missing.join(" "), /eşik %10/u);
  const allowed = assessMobileReleaseRollout("0.97.0", 50, devices);
  assert.equal(allowed.readyToAdvance, true);
});

test("validates owner rollout creation and ordered action inputs", () => {
  assert.equal(createMobileReleaseRolloutSchema.safeParse({
    targetVersion: "0.97.0",
    previousStableVersion: "0.96.0",
    maxUnhealthyPercent: 10,
    notes: "Fiziksel pilot onayından sonra yüzde on rollout.",
  }).success, true);
  assert.equal(createMobileReleaseRolloutSchema.safeParse({
    targetVersion: "0.97.0", previousStableVersion: "0.97.0", notes: "Geçersiz sürüm çifti",
  }).success, false);
  assert.equal(mobileReleaseRolloutActionSchema.safeParse({
    action: "advance", targetPercentage: 25, reason: "Sağlık kapısı başarılı.",
  }).success, true);
  assert.equal(mobileReleaseRolloutActionSchema.safeParse({
    action: "advance", targetPercentage: 80, reason: "Geçersiz aşama.",
  }).success, false);
});

test("persists tenant-isolated rollout state and append-only decision evidence", async () => {
  const migration = await readFile(resolve(root, "packages/database/migrations/052_mobile_release_rollouts.sql"), "utf8");
  assert.match(migration, /UNIQUE \(tenant_id, target_version\)/u);
  assert.match(migration, /ALTER TABLE mobile_release_rollouts FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /ALTER TABLE mobile_release_rollout_events FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /GRANT SELECT, INSERT ON mobile_release_rollout_events TO filo_app/u);
  const routes = await readFile(resolve(root, "apps/api/src/routes/mobile-release-rollouts.ts"), "utf8");
  assert.match(routes, /ACTIVE_MOBILE_RELEASE_APPROVAL_REQUIRED/u);
  assert.match(routes, /MOBILE_RELEASE_ROLLOUT_HEALTH_GATE_FAILED/u);
  assert.match(routes, /FOR UPDATE/u);
  assert.match(routes, /mobile\.release_rollout_/u);
});
