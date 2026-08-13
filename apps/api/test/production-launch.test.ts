import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  activateProductionLaunchSchema,
  productionLaunchActionSchema,
} from "@filo/contracts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

test("requires explicit production activation and resume confirmations", () => {
  assert.equal(activateProductionLaunchSchema.safeParse({
    readinessReviewId: "10000000-0000-4000-8000-000000000001",
    confirmation: "ACTIVATE_PRODUCTION",
    notes: "Canlı güvenlik kapıları yeniden doğrulandı.",
  }).success, true);
  assert.equal(activateProductionLaunchSchema.safeParse({
    readinessReviewId: "10000000-0000-4000-8000-000000000001",
    confirmation: "activate",
    notes: "Canlı güvenlik kapıları yeniden doğrulandı.",
  }).success, false);
  assert.equal(productionLaunchActionSchema.safeParse({
    action: "suspend",
    reason: "Operasyonel güvenlik incelemesi başlatıldı.",
  }).success, true);
  assert.equal(productionLaunchActionSchema.safeParse({
    action: "resume",
    confirmation: "RESUME_PRODUCTION",
    reason: "Canlı kapılar yeniden doğrulandı.",
  }).success, true);
  assert.equal(productionLaunchActionSchema.safeParse({
    action: "resume",
    reason: "Canlı kapılar yeniden doğrulandı.",
  }).success, false);
});

test("enforces GO-linked immutable tenant production certificates", async () => {
  const migration = await readFile(
    resolve(root, "packages/database/migrations/055_production_launch_activation.sql"),
    "utf8",
  );
  assert.match(migration, /production_launches_one_active/u);
  assert.match(migration, /production_launch_requires_go/u);
  assert.match(migration, /production_launch_certificate_immutable/u);
  assert.match(migration, /certificate_sha256 text NOT NULL/u);
  assert.match(migration, /ALTER TABLE production_launches FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /ALTER TABLE production_launch_events FORCE ROW LEVEL SECURITY/u);
  assert.match(migration, /REVOKE ALL ON production_launches, production_launch_events FROM PUBLIC/u);

  const routes = await readFile(resolve(root, "apps/api/src/routes/production-launch.ts"), "utf8");
  assert.match(routes, /pg_advisory_xact_lock/u);
  assert.match(routes, /PRODUCTION_LIVE_GATE_FAILED/u);
  assert.match(routes, /encode\(digest\(snapshot::text,'sha256'\),'hex'\)/u);
  assert.match(routes, /status = 'completed' AND target_percentage = 100/u);
  assert.match(routes, /status IN \('open','acknowledged'\)/u);
  assert.match(routes, /production\.launch_activated/u);
  assert.match(routes, /certificate\.json/u);
});
