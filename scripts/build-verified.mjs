#!/usr/bin/env node
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { parseDuration, projectRoot, runTool, sitesEnvironment } from "./run-tool.mjs";
import { validateArtifact } from "./validate-artifact.mjs";

console.log("Running bounded vinext build...");
await rm(resolve(projectRoot, "dist"), { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
await runTool("vinext", ["build"], {
  env: sitesEnvironment({ SOURCE_DATE_EPOCH: process.env.SOURCE_DATE_EPOCH || "0" }),
  timeoutMs: parseDuration(process.env.SITES_BUILD_TIMEOUT, 180_000),
});
await validateArtifact();
