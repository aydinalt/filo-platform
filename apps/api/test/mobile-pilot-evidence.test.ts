import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createMobilePilotRunSchema,
  decideMobilePilotRunSchema,
  type MobilePilotEvidenceType,
} from "@filo/contracts";
import {
  REQUIRED_MOBILE_PILOT_EVIDENCE,
  assessMobilePilotEvidence,
} from "../src/lib/mobile-pilot-evidence.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("requires all physical pilot evidence before readiness", () => {
  assert.equal(REQUIRED_MOBILE_PILOT_EVIDENCE.length, 6);
  const incomplete = assessMobilePilotEvidence([
    "permission_always", "heartbeat_online", "background_location",
  ]);
  assert.equal(incomplete.ready, false);
  assert.equal(incomplete.passedCount, 3);
  assert.deepEqual(incomplete.missing, ["offline_queue", "queue_recovered", "remote_control"]);

  const complete = assessMobilePilotEvidence(REQUIRED_MOBILE_PILOT_EVIDENCE);
  assert.equal(complete.ready, true);
  assert.equal(complete.passedCount, complete.requiredCount);
  assert.deepEqual(complete.missing, []);
});

test("deduplicates repeated pilot evidence without changing readiness", () => {
  const repeated: MobilePilotEvidenceType[] = [
    "permission_always", "permission_always", "heartbeat_online",
  ];
  const result = assessMobilePilotEvidence(repeated);
  assert.equal(result.passedCount, 2);
  assert.equal(result.requiredCount, 6);
});

test("bounds pilot run creation and owner decision notes", () => {
  assert.equal(createMobilePilotRunSchema.safeParse({ notes: "Android saha pilotu" }).success, true);
  assert.equal(createMobilePilotRunSchema.safeParse({ notes: "x".repeat(501) }).success, false);
  assert.equal(decideMobilePilotRunSchema.safeParse({
    decision: "passed", notes: "Altı kanıtın tamamı doğrulandı.",
  }).success, true);
  assert.equal(decideMobilePilotRunSchema.safeParse({ decision: "passed", notes: "ok" }).success, false);
});

test("keeps pilot runs tenant-isolated and completion evidence-gated", async () => {
  const migration = await readFile(
    resolve(root, "packages/database/migrations/050_mobile_pilot_evidence.sql"),
    "utf8",
  );
  assert.match(migration, /mobile_pilot_runs_one_active_device/u);
  assert.match(migration, /ALTER TABLE mobile_pilot_runs FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /ALTER TABLE mobile_pilot_evidence FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /UNIQUE \(run_id, evidence_type\)/u);
  assert.match(migration, /REVOKE ALL ON mobile_pilot_runs, mobile_pilot_evidence FROM PUBLIC/u);

  const routes = await readFile(resolve(root, "apps/api/src/routes/mobile-pilot-runs.ts"), "utf8");
  assert.match(routes, /PILOT_EVIDENCE_INCOMPLETE/u);
  assert.match(routes, /mobile\.pilot_run_started/u);
  assert.match(routes, /mobile\.pilot_run_decided/u);
  assert.match(routes, /report\.csv/u);

  const mobileRoutes = await readFile(resolve(root, "apps/api/src/routes/mobile.ts"), "utf8");
  assert.match(mobileRoutes, /"offline_queue"/u);
  assert.match(mobileRoutes, /"queue_recovered"/u);
  assert.match(mobileRoutes, /"remote_control"/u);
});
