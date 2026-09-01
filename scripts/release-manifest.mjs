#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";

const root=resolve(import.meta.dirname,".."),outputDir=resolve(root,"outputs"),excludedDirectories=new Set([".git","node_modules",".next","dist","outputs",".sites-runtime",".wrangler",".vinext",".cache"]),excludedFiles=new Set(["tsconfig.tsbuildinfo"]);
async function sourceFiles(directory=root){const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){if(entry.isDirectory()&&excludedDirectories.has(entry.name))continue;if(entry.isFile()&&excludedFiles.has(entry.name))continue;const path=resolve(directory,entry.name);if(entry.isDirectory())files.push(...await sourceFiles(path));else if(entry.isFile())files.push(relative(root,path).replaceAll("\\","/"))}return files}
const files=(await sourceFiles()).sort();
const digest=async file=>createHash("sha256").update(await readFile(resolve(root,file))).digest("hex");
const source=[];for(const file of files){const info=await stat(resolve(root,file));source.push({file,bytes:info.size,sha256:await digest(file)})}
const worker="dist/server/index.js",hosting="dist/.openai/hosting.json";
for(const file of [worker,hosting])await stat(resolve(root,file));
const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim(),dirty=Boolean(execFileSync("git",["status","--porcelain"],{cwd:root,encoding:"utf8"}).trim());
const manifest={format:"FILO_RELEASE_MANIFEST_V2",release:"1.28.20",commit,dirty,generatedAt:new Date().toISOString(),source,artifacts:[{file:worker,sha256:await digest(worker)},{file:hosting,sha256:await digest(hosting)}]};
await mkdir(outputDir,{recursive:true});await writeFile(resolve(outputDir,"release-manifest.json"),JSON.stringify(manifest,null,2)+"\n","utf8");
console.log(`RELEASE_MANIFEST_READY ${manifest.commit} ${source.length} files dirty=${dirty}`);
