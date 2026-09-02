#!/usr/bin/env node
import { npmCliPath, runProcess } from "./run-tool.mjs";

const checks = [
  ["run", "security:scan"],
  ["run", "migration:lint"],
  ["run", "gates:4-15"],
  ["run", "capacity:verify"],
  ["run", "readiness:final"],
  ["run", "technical:readiness"],
  ["run", "lint"],
  ["run", "typecheck"],
  ["test"],
  ["run", "release:manifest"],
  ["run", "sbom"],
];

for (const args of checks) await runProcess(process.execPath, [npmCliPath(), ...args]);
