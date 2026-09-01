import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const evidenceRoot = resolve(root, "docs/production-evidence");
const required = [
  "README.md",
  "legal-approval-template.md",
  "device-field-matrix.csv",
  "security-load-report-template.md",
  "provider-lifecycle-template.csv",
  "data-migration-acceptance-template.csv",
  "backup-restore-template.csv",
  "localization-acceptance-template.csv",
  "pilot-uat-template.csv",
  "store-release-template.csv",
  "operations-runbook-template.md",
  "rollout-observation-template.csv",
  "rollout-observation-guide.md",
  "provider-account-inventory.csv",
  "capacity-cost-template.csv",
  "production-preflight-template.json",
  "mobile-field-evidence-template.json",
  "hardware-gateway-evidence-template.json",
  "final-production-acceptance-template.json",
];

test("production evidence pack includes every external gate template", async () => {
  for (const name of required) {
    const content = await readFile(resolve(evidenceRoot, name), "utf8");
    assert.ok(content.length > 20, `${name} should not be empty`);
  }
});

test("production preflight is secret-safe and supports strict/json modes", async () => {
  const script = await readFile(resolve(root, "scripts/production-preflight.mjs"), "utf8");
  assert.match(script, /FILO_PRODUCTION_PREFLIGHT_V3/u);
  assert.match(script, /secretValuesIncluded\s*:\s*false/u);
  assert.match(script, /--strict/u);
  assert.match(script, /--json/u);
  for (const gate of ["ENVIRONMENT_ISOLATION", "SECRET_ROTATION", "QUALIFIED_ESIGN", "TRACKER_GATEWAYS", "MAP_PROVIDER"]) {
    assert.match(script, new RegExp(gate, "u"));
  }
  assert.doesNotMatch(script, /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)/u);
});

test("evidence templates do not contain secret-like values", async () => {
  for (const name of required) {
    const content = await readFile(resolve(evidenceRoot, name), "utf8");
    assert.doesNotMatch(content, /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)/u);
  }
});
