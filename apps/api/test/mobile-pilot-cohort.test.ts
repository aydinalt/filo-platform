import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  approveMobilePilotReleaseSchema,
  claimMobileEnrollmentSchema,
  revokeMobilePilotReleaseSchema,
  type MobilePilotCohortDevice,
} from "@filo/contracts";
import { assessMobilePilotCohort } from "../src/lib/mobile-pilot-cohort.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const completedAt = "2026-08-13T10:00:00.000Z";

function device(
  runId: string,
  platform: "android" | "ios",
  manufacturer: string,
  model: string,
  appVersion = "0.96.0",
): MobilePilotCohortDevice {
  return { runId, platform, deviceManufacturer: manufacturer, deviceModel: model, appVersion, completedAt };
}

test("requires one iPhone and two distinct Android/OEM models on the target version", () => {
  const ready = assessMobilePilotCohort("0.96.0", [
    device("10000000-0000-4000-8000-000000000001", "ios", "Apple", "iPhone 17"),
    device("10000000-0000-4000-8000-000000000002", "android", "Samsung", "SM-S938B"),
    device("10000000-0000-4000-8000-000000000003", "android", "Xiaomi", "2312DRA50G"),
  ]);
  assert.equal(ready.ready, true);
  assert.equal(ready.iosPassed, 1);
  assert.equal(ready.androidPassed, 2);
  assert.equal(ready.distinctAndroidModels, 2);
  assert.deepEqual(ready.missing, []);
});

test("does not count stale versions or duplicate Android model labels", () => {
  const result = assessMobilePilotCohort("0.96.0", [
    device("10000000-0000-4000-8000-000000000001", "ios", "Apple", "iPhone 17", "0.95.0"),
    device("10000000-0000-4000-8000-000000000002", "android", "Samsung", "SM-S938B"),
    device("10000000-0000-4000-8000-000000000003", "android", " samsung ", "sm-s938b"),
  ]);
  assert.equal(result.ready, false);
  assert.equal(result.iosPassed, 0);
  assert.equal(result.androidPassed, 2);
  assert.equal(result.distinctAndroidModels, 1);
  assert.deepEqual(result.missing, ["1 iPhone pilotu", "1 farklı Android/OEM modeli"]);
});

test("bounds automatic device metadata and owner approval inputs", () => {
  assert.equal(claimMobileEnrollmentSchema.safeParse({
    token: `10000000-0000-4000-8000-000000000001.${"A".repeat(43)}`,
    platform: "android", deviceName: "Saha telefonu",
    deviceManufacturer: "Samsung", deviceModel: "SM-S938B",
  }).success, true);
  assert.equal(approveMobilePilotReleaseSchema.safeParse({
    targetVersion: "0.96.0", notes: "Üç cihaz pilot matrisi tamamlandı.",
  }).success, true);
  assert.equal(approveMobilePilotReleaseSchema.safeParse({ targetVersion: "latest", notes: "ok" }).success, false);
  assert.equal(revokeMobilePilotReleaseSchema.safeParse({ reason: "Yeni regresyon bulundu." }).success, true);
});

test("stores tenant-isolated approval snapshots and serializes release decisions", async () => {
  const migration = await readFile(
    resolve(root, "packages/database/migrations/051_mobile_pilot_cohort_release.sql"),
    "utf8",
  );
  assert.match(migration, /mobile_pilot_release_one_active_version/u);
  assert.match(migration, /ALTER TABLE mobile_pilot_release_approvals FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /readiness_snapshot jsonb NOT NULL/u);
  assert.match(migration, /mobile_pilot_release_snapshot_immutable/u);
  assert.match(migration, /qualified_app_version/u);
  assert.match(migration, /device_manufacturer/u);
  assert.match(migration, /REVOKE ALL ON FUNCTION claim_mobile_enrollment\(uuid, text, uuid, text, text, text, text, text\)/u);

  const routes = await readFile(resolve(root, "apps/api/src/routes/mobile-pilot-release.ts"), "utf8");
  assert.match(routes, /pg_advisory_xact_lock/u);
  assert.match(routes, /MOBILE_PILOT_COHORT_INCOMPLETE/u);
  assert.match(routes, /mobile\.pilot_release_approved/u);
  assert.match(routes, /mobile\.pilot_release_revoked/u);
  assert.match(routes, /report\.csv/u);
});
