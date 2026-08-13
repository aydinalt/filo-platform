import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLaunchReadinessReviewSchema,
  decideLaunchReadinessSchema,
  updateLaunchReadinessEvidenceSchema,
} from "@filo/contracts";
import { assessLaunchReadiness, launchReadinessEvidenceTypes } from "../src/lib/launch-readiness.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("requires approval, completed rollout and zero active incidents", () => {
  const ready = assessLaunchReadiness("0.99.0", {
    pilotApproval: true,
    completedRollout: true,
    activeIncidentCount: 0,
  });
  assert.equal(ready.ready, true);
  assert.equal(ready.checks.length, 3);
  assert.ok(ready.checks.every((check) => check.passed));

  const blocked = assessLaunchReadiness("0.99.0", {
    pilotApproval: true,
    completedRollout: false,
    activeIncidentCount: 2,
  });
  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.checks.filter((check) => !check.passed).map((check) => check.key), [
    "completed_rollout",
    "no_active_incidents",
  ]);
});

test("defines all required launch evidence and bounds decision inputs", () => {
  assert.deepEqual(launchReadinessEvidenceTypes, [
    "privacy_legal",
    "backup_restore",
    "worker_continuity",
    "monitoring_alerts",
    "support_oncall",
    "rollback_drill",
  ]);
  assert.equal(createLaunchReadinessReviewSchema.safeParse({
    targetVersion: "0.99.0",
    notes: "v1.0 öncesi canlıya geçiş kanıtları.",
  }).success, true);
  assert.equal(createLaunchReadinessReviewSchema.safeParse({ targetVersion: "latest", notes: "hazır" }).success, false);
  assert.equal(updateLaunchReadinessEvidenceSchema.safeParse({ status: "passed", notes: "Tatbikat başarıyla tamamlandı." }).success, true);
  assert.equal(decideLaunchReadinessSchema.safeParse({ decision: "go", notes: "Tüm kapılar doğrulandı." }).success, true);
});

test("stores tenant-isolated immutable launch decisions and gates GO in the route", async () => {
  const migration = await readFile(
    resolve(root, "packages/database/migrations/054_launch_readiness_gate.sql"),
    "utf8",
  );
  assert.match(migration, /launch_readiness_one_draft/u);
  assert.match(migration, /launch_readiness_decision_immutable/u);
  assert.match(migration, /launch_readiness_evidence_immutable/u);
  assert.match(migration, /ALTER TABLE launch_readiness_reviews FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /ALTER TABLE launch_readiness_evidence FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /REVOKE ALL ON launch_readiness_reviews, launch_readiness_evidence FROM PUBLIC/u);

  const routes = await readFile(resolve(root, "apps/api/src/routes/launch-readiness.ts"), "utf8");
  assert.match(routes, /pg_advisory_xact_lock/u);
  assert.match(routes, /LAUNCH_READINESS_GATE_FAILED/u);
  assert.match(routes, /'launch\.readiness_' \|\| \$3/u);
  assert.match(routes, /status = 'completed' AND target_percentage = 100/u);
});
