#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot } from "./run-tool.mjs";

export async function validateArtifact(root = projectRoot) {
  const workerPath = resolve(root, "dist/server/index.js");
  const hostingPath = resolve(root, "dist/.openai/hosting.json");
  JSON.parse(await readFile(hostingPath, "utf8"));
  await readFile(workerPath);
  const workerUrl = pathToFileURL(workerPath);
  workerUrl.searchParams.set("sites-validation", `${process.pid}-${Date.now()}`);
  const worker = await import(workerUrl.href);
  if (!worker.default || typeof worker.default.fetch !== "function") throw new Error("dist/server/index.js must export default.fetch(request, env, ctx).");
  console.log("Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await validateArtifact();
