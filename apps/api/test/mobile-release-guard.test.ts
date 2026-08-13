import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMobileReleaseRolloutSchema,
  runMobileReleaseGuardSchema,
  updateMobileReleaseIncidentSchema,
} from "@filo/contracts";
import { decideMobileReleaseGuard } from "../src/lib/mobile-release-guard.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("automatically pauses the first unhealthy active rollout evaluation", () => {
  assert.equal(decideMobileReleaseGuard({
    healthy: false, status: "active", guardMode: "auto_rollback",
    nextBreaches: 1, rollbackAfterBreaches: 3,
  }), "pause");
  assert.equal(decideMobileReleaseGuard({
    healthy: false, status: "active", guardMode: "manual",
    nextBreaches: 1, rollbackAfterBreaches: 3,
  }), "record");
});

test("rolls back only after the configured consecutive paused breach threshold", () => {
  assert.equal(decideMobileReleaseGuard({
    healthy: false, status: "paused", guardMode: "auto_rollback",
    nextBreaches: 2, rollbackAfterBreaches: 3,
  }), "record");
  assert.equal(decideMobileReleaseGuard({
    healthy: false, status: "paused", guardMode: "auto_rollback",
    nextBreaches: 3, rollbackAfterBreaches: 3,
  }), "rollback");
  assert.equal(decideMobileReleaseGuard({
    healthy: true, status: "paused", guardMode: "auto_rollback",
    nextBreaches: 3, rollbackAfterBreaches: 3,
  }), "healthy");
});

test("bounds guard policy, idempotency keys and owner incident transitions", () => {
  assert.equal(createMobileReleaseRolloutSchema.safeParse({
    targetVersion: "0.98.0", previousStableVersion: "0.97.0",
    maxUnhealthyPercent: 10, guardMode: "auto_rollback", rollbackAfterBreaches: 3,
    notes: "Otomatik duraklatma ve geri alma koruması.",
  }).success, true);
  assert.equal(createMobileReleaseRolloutSchema.safeParse({
    targetVersion: "0.98.0", previousStableVersion: "0.97.0",
    maxUnhealthyPercent: 10, guardMode: "auto_rollback", rollbackAfterBreaches: 9,
    notes: "Geçersiz eşik.",
  }).success, false);
  assert.equal(runMobileReleaseGuardSchema.safeParse({
    tenantId: "10000000-0000-4000-8000-000000000001",
    actorUserId: "20000000-0000-4000-8000-000000000001",
    runKey: "mobile-release-guard:2026-08-13:15:00",
  }).success, true);
  assert.equal(updateMobileReleaseIncidentSchema.safeParse({ status: "resolved", notes: "Kök neden giderildi." }).success, true);
});

test("stores idempotent guard runs and tenant-isolated incident evidence", async () => {
  const migration = await readFile(resolve(root, "packages/database/migrations/053_mobile_release_guard.sql"), "utf8");
  assert.match(migration, /mobile_release_incidents_one_active/u);
  assert.match(migration, /ALTER TABLE mobile_release_incidents FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /ALTER TABLE mobile_release_guard_runs FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /UNIQUE \(tenant_id, run_key\)/u);
  const guard = await readFile(resolve(root, "apps/api/src/lib/mobile-release-guard.ts"), "utf8");
  assert.match(guard, /pg_advisory_xact_lock/u);
  assert.match(guard, /auto_rolled_back/u);
  assert.match(guard, /ON CONFLICT \(tenant_id, rollout_id\)/u);
  const worker = await readFile(resolve(root, "apps/worker/src/api-client.ts"), "utf8");
  assert.match(worker, /mobile-release-guard\/run/u);
});
