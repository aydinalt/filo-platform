#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root=resolve(import.meta.dirname,".."),dist=resolve(root,"dist"),command=process.platform==="win32"?"npm.cmd":"npm";
async function filesAt(directory){const items=[];for(const entry of await readdir(directory,{withFileTypes:true})){const full=resolve(directory,entry.name);if(entry.isDirectory())items.push(...await filesAt(full));else items.push(full)}return items.sort()}
function normalizedBuildContent(name,content){
  if(name==="server/index.js")return Buffer.from(content.toString("utf8").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,"<VINEXT_GENERATED_UUID>"));
  if(name.endsWith("vinext-server.json")){const payload=JSON.parse(content.toString("utf8"));if(payload.prerenderSecret)payload.prerenderSecret="<VINEXT_GENERATED_PRERENDER_SECRET>";return Buffer.from(JSON.stringify(payload))}
  return content;
}
async function fingerprint(){const hash=createHash("sha256"),files={};for(const file of await filesAt(dist)){const name=relative(dist,file),content=normalizedBuildContent(name,await readFile(file)),fileHash=createHash("sha256").update(content).digest("hex");files[name]=fileHash;hash.update(name);hash.update(content)}return {digest:hash.digest("hex"),files}}
async function build(){await rm(dist,{recursive:true,force:true});const run=spawnSync(command,["run","build"],{cwd:root,stdio:"inherit",env:{...process.env,SOURCE_DATE_EPOCH:process.env.SOURCE_DATE_EPOCH||"0"}});if(run.status!==0)process.exit(run.status??1)}
await build();const first=await fingerprint();await build();const second=await fingerprint();const changed=[...new Set([...Object.keys(first.files),...Object.keys(second.files)])].filter(file=>first.files[file]!==second.files[file]);const result={format:"FILO_REPRODUCIBLE_BUILD_V1",status:first.digest===second.digest?"PASSED":"BLOCKED",first:first.digest,second:second.digest,changed};
result.normalizedEntropy=["server/index.js: Vinext build/draft UUID", "**/vinext-server.json: per-build prerender secret"];
await mkdir(resolve(root,"outputs"),{recursive:true});await writeFile(resolve(root,"outputs/reproducible-build.json"),JSON.stringify(result,null,2)+"\n","utf8");console.log(JSON.stringify(result,null,2));if(result.status!=="PASSED")process.exitCode=1;
