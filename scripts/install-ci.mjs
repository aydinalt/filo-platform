#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { npmCliPath, parseDuration, projectRoot, runProcess, sitesEnvironment } from "./run-tool.mjs";

const runtimeRoot = resolve(process.env.SITES_RUNTIME_ROOT || resolve(projectRoot, ".sites-runtime"));
const lockPath = resolve(runtimeRoot, "install.lock");
await mkdir(runtimeRoot, { recursive: true });
let lock;
try {
  lock = await open(lockPath, "wx");
} catch (error) {
  if (error?.code === "EEXIST") throw new Error("Another dependency install is already running for this project.");
  throw error;
}

try {
  await lock.writeFile(`${process.pid}\n`, "utf8");
  const lockfile = await readFile(resolve(projectRoot, "package-lock.json"));
  const lockfileSha256 = createHash("sha256").update(lockfile).digest("hex");
  const nodeArgs = [...(process.platform === "win32" ? ["--use-system-ca"] : []), npmCliPath(), "ci"];
  console.log("Running one bounded npm ci...");
  await runProcess(process.execPath, nodeArgs, {
    env: sitesEnvironment({ NPM_CONFIG_MAXSOCKETS: "1", NPM_CONFIG_FETCH_RETRIES: "0", NPM_CONFIG_FETCH_TIMEOUT: "30000" }),
    timeoutMs: parseDuration(process.env.SITES_INSTALL_TIMEOUT, 480_000),
  });
  await writeFile(resolve(projectRoot, "node_modules/.sites-install.json"), `${JSON.stringify({ lockfile_sha256: lockfileSha256, node: process.version, platform: `${process.platform}-${process.arch}` }, null, 2)}\n`, "utf8");
  console.log("npm ci passed and the locked toolchain is available.");
} finally {
  await lock.close();
  await rm(lockPath, { force: true });
}
