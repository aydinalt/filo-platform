#!/usr/bin/env node
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import { projectRoot, runTool } from "./run-tool.mjs";

// Next and Vinext generate incompatible declarations under the same .next/types
// path. They are build artifacts, so remove stale copies before checking sources.
for (const relativePath of [".next/types", ".next/dev/types"]) {
  await rm(resolve(projectRoot, relativePath), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 250,
  });
}

await runTool("tsc", ["--noEmit", "--pretty", "false", "--incremental", "false"]);
