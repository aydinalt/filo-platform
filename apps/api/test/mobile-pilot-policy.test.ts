import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  acknowledgeMobileDeviceCommandSchema,
  createMobileDeviceCommandSchema,
  updateMobilePilotPolicySchema,
} from "@filo/contracts";
import {
  compareReleaseVersions,
  requiredMobileAction,
} from "../src/lib/mobile-pilot-policy.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const policy = {
  trackingEnabled: true,
  minimumAppVersion: "0.94.0",
  heartbeatIntervalSeconds: 60,
  updatedAt: null,
};

test("compares bounded three-part mobile release versions", () => {
  assert.equal(compareReleaseVersions("0.94.0", "0.94.0"), 0);
  assert.equal(compareReleaseVersions("0.95.0", "0.94.9"), 1);
  assert.equal(compareReleaseVersions("0.93.12", "0.94.0"), -1);
  assert.equal(requiredMobileAction(policy, "0.93.0"), "upgrade");
  assert.equal(requiredMobileAction(policy, "0.94.0"), "none");
  assert.equal(requiredMobileAction({ ...policy, trackingEnabled: false }, "9.0.0"), "pause");
});

test("validates pilot policy, command and acknowledgement boundaries", () => {
  assert.equal(updateMobilePilotPolicySchema.safeParse({
    trackingEnabled: true, minimumAppVersion: "0.94.0", heartbeatIntervalSeconds: 30,
  }).success, true);
  assert.equal(updateMobilePilotPolicySchema.safeParse({
    trackingEnabled: true, minimumAppVersion: "latest", heartbeatIntervalSeconds: 10,
  }).success, false);
  assert.equal(createMobileDeviceCommandSchema.safeParse({
    type: "pause_tracking", reason: "Pilot güvenlik durdurması",
  }).success, true);
  assert.equal(createMobileDeviceCommandSchema.safeParse({
    type: "resume_tracking", reason: "Pilot kontrolü tamamlandı",
  }).success, true);
  assert.equal(createMobileDeviceCommandSchema.safeParse({ type: "wipe_device", reason: "no" }).success, false);
  assert.equal(acknowledgeMobileDeviceCommandSchema.safeParse({
    status: "acknowledged", resultCode: "QUEUE_FLUSHED",
  }).success, true);
});

test("keeps remote controls tenant-isolated, idempotent and audited", async () => {
  const migration = await readFile(
    resolve(root, "packages/database/migrations/049_mobile_pilot_remote_controls.sql"),
    "utf8",
  );
  assert.match(migration, /ALTER TABLE mobile_pilot_policies FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /ALTER TABLE mobile_device_commands FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /mobile_device_commands_pending_unique/u);
  assert.match(migration, /pilot_tracking_allowed boolean NOT NULL DEFAULT true/u);
  assert.match(migration, /command_type IN \('pause_tracking', 'resume_tracking', 'sync_now'\)/u);
  assert.match(migration, /REVOKE ALL ON mobile_pilot_policies, mobile_device_commands FROM PUBLIC/u);

  const routes = await readFile(resolve(root, "apps/api/src/routes/mobile.ts"), "utf8");
  assert.match(routes, /mobile\.pilot_policy_updated/u);
  assert.match(routes, /mobile\.device_command_created/u);
  assert.match(routes, /mobile\.device_command_acknowledged/u);
  assert.match(routes, /requiredMobileAction\(policy, credential\.rows\[0\]\?\.appVersion/u);
});
