#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,".."),outputDir=resolve(root,"outputs");
const files=execFileSync("git",["ls-files"],{cwd:root,encoding:"utf8"}).split(/\r?\n/).filter(Boolean).sort();
const digest=async file=>createHash("sha256").update(await readFile(resolve(root,file))).digest("hex");
const source=[];for(const file of files){const info=await stat(resolve(root,file));source.push({file,bytes:info.size,sha256:await digest(file)})}
const worker="dist/server/index.js",hosting="dist/.openai/hosting.json";
for(const file of [worker,hosting])await stat(resolve(root,file));
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),dirty=Boolean(execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim());
const componentFiles=["package.json","mobile-driver/package.json","services/telematics-gateway/package.json"];
const components=[];for(const file of componentFiles){const component=JSON.parse(await readFile(resolve(root,file),"utf8"));if(component.version!=="1.28.20")throw new Error(`${file} sürümü 1.28.20 değil.`);components.push({name:component.name,version:component.version,file,sha256:await digest(file)})}
const manifest={format:"FILO_RELEASE_MANIFEST_V3",release:"1.28.20",commit,dirty,generatedAt:new Date().toISOString(),source,components,artifacts:[{target:"cloudflare-sites",file:worker,sha256:await digest(worker)},{target:"cloudflare-sites",file:hosting,sha256:await digest(hosting)},{target:"vercel-supabase",verification:"npm run build:vercel"},{target:"mobile-driver",lockfile:"mobile-driver/package-lock.json",sha256:await digest("mobile-driver/package-lock.json")},{target:"telematics-gateway",lockfile:"services/telematics-gateway/package-lock.json",sha256:await digest("services/telematics-gateway/package-lock.json")} ]};
await mkdir(outputDir,{recursive:true});await writeFile(resolve(outputDir,"release-manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
console.log(`RELEASE_MANIFEST_READY ${manifest.commit} ${source.length} files dirty=${dirty}`);
