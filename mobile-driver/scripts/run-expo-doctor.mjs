#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const doctor = resolve(import.meta.dirname, "..", "node_modules", "expo-doctor", "bin", "expo-doctor.js");
const nodeArguments = process.platform === "win32" ? ["--use-system-ca", doctor] : [doctor];
const result = spawnSync(process.execPath, nodeArguments, { stdio: "inherit" });

if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
