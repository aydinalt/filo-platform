#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,".."),outputDir=resolve(root,"outputs");
await mkdir(outputDir,{recursive:true});
const command=process.platform==="win32"?"npm.cmd":"npm";
const run=spawnSync(command,["sbom","--package-lock-only","--sbom-format","cyclonedx","--sbom-type","application"],{cwd:root,encoding:"utf8",maxBuffer:20*1024*1024});
if(run.status!==0){process.stderr.write(run.stderr||"SBOM üretilemedi.\n");process.exit(1)}
JSON.parse(run.stdout);await writeFile(resolve(outputDir,"sbom.cdx.json"),run.stdout,"utf8");
console.log("SBOM_READY outputs/sbom.cdx.json");
