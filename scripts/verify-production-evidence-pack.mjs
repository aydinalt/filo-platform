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
  "mobile-field-evidence-template.json",
  "hardware-gateway-evidence-template.json",
  "final-production-acceptance-template.json",
];
const secretPattern = /(sk-[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)/u;
const checked = [];
const blockers = [];
for (const name of required) {
  const file = resolve(evidenceRoot, name);
  try {
    const content = await readFile(file, "utf8");
    checked.push({ name, bytes: Buffer.byteLength(content) });
    if (!content.trim()) blockers.push(`${name}: boş dosya`);
    if (secretPattern.test(content)) blockers.push(`${name}: gizli değer kalıbı bulundu`);
  } catch {
    blockers.push(`${name}: eksik`);
  }
}
const result = {
  format: "FILO_PRODUCTION_EVIDENCE_PACK_V1",
  status: blockers.length ? "BLOCKED" : "TEMPLATES_READY",
  checked,
  blockers,
  note: "Şablonların bulunması gerçek sağlayıcı, hukuk, cihaz veya pilot kanıtı oluşturmaz.",
};
console.log(JSON.stringify(result, null, 2));
if (process.argv.includes("--strict") && blockers.length) process.exitCode = 1;
