#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

const root=resolve(import.meta.dirname,".."),dist=resolve(root,"dist");
async function filesAt(directory){const items=[];for(const entry of await readdir(directory,{withFileTypes:true})){const full=resolve(directory,entry.name);if(entry.isDirectory())items.push(...await filesAt(full));else items.push(full)}return items.sort()}
function buildEntropy(entries){
  const values=new Set();
  for(const {name,content} of entries){
    const text=content.toString("utf8");
    const portableName=name.replaceAll("\\","/");
    if(name.endsWith("vinext-server.json")){const value=JSON.parse(text).prerenderSecret;if(value)values.add(value)}
    if(portableName==="server/index.js")for(const match of text.matchAll(/var\s+\w+=`([0-9a-f]{32})`/giu))values.add(match[1]);
    if(/^server\/_next\/static\/isr-cache-.*\.js$/u.test(portableName))for(const match of text.matchAll(/(?<![0-9a-f])[0-9a-f]{64}(?![0-9a-f])/giu))values.add(match[0]);
  }
  return values;
}
function normalizedBuildContent(content,entropy){
  let text=content.toString("utf8");
  for(const value of entropy)text=text.replaceAll(value,"<VINEXT_GENERATED_SECRET>");
  text=text
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,"<VINEXT_GENERATED_UUID>")
    .replace(/-[A-Za-z0-9_-]{8}(?=\.js)/gu,"-<VINEXT_CHUNK_HASH>");
  return Buffer.from(text);
}
function normalizedBuildName(name,contentHash){
  const portable=name.replaceAll("\\","/").replace(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/giu,"<VINEXT_GENERATED_UUID>");
  return portable.replace(/-[A-Za-z0-9_-]{8}(?=\.js$)/u,`-${contentHash.slice(0,16)}`);
}
async function fingerprint(){
  const entries=[];for(const file of await filesAt(dist))entries.push({name:relative(dist,file),content:await readFile(file)});
  const entropy=buildEntropy(entries),normalized=[];
  for(const entry of entries){const content=normalizedBuildContent(entry.content,entropy),fileHash=createHash("sha256").update(content).digest("hex");normalized.push({name:normalizedBuildName(entry.name,fileHash),content,fileHash})}
  normalized.sort((a,b)=>a.name.localeCompare(b.name));
  const hash=createHash("sha256"),files={},contents={};for(const entry of normalized){if(files[entry.name])throw new Error(`Normalized build path collision: ${entry.name}`);files[entry.name]=entry.fileHash;contents[entry.name]=entry.content.toString("utf8");hash.update(entry.name);hash.update(entry.content)}return {digest:hash.digest("hex"),files,contents};
}
async function build(){
  await rm(dist,{recursive:true,force:true,maxRetries:10,retryDelay:250});
  const command=process.platform==="win32"?process.execPath:"npm";
  const args=process.platform==="win32"?[resolve(root,"node_modules/vinext/dist/cli.js"),"build"]:["run","build"];
  const run=spawnSync(command,args,{cwd:root,stdio:"inherit",env:{
    ...process.env,
    SOURCE_DATE_EPOCH:process.env.SOURCE_DATE_EPOCH||"0",
  }});
  if(run.status!==0)process.exit(run.status??1);
}
await build();const first=await fingerprint();await build();const second=await fingerprint();const changed=[...new Set([...Object.keys(first.files),...Object.keys(second.files)])].filter(file=>first.files[file]!==second.files[file]);const result={format:"FILO_REPRODUCIBLE_BUILD_V1",status:first.digest===second.digest?"PASSED":"BLOCKED",first:first.digest,second:second.digest,changed};
if(result.status==="BLOCKED")result.diagnostics=changed.filter(file=>first.contents[file]&&second.contents[file]).slice(0,3).map(file=>{const a=first.contents[file],b=second.contents[file];let index=0;while(index<a.length&&a[index]===b[index])index+=1;return{file,index,first:a.slice(Math.max(0,index-80),index+160),second:b.slice(Math.max(0,index-80),index+160)}});
result.normalizedEntropy=["Vinext build/draft UUID", "Vinext preview and prerender secrets", "content-addressed Vite chunk filenames"];
await mkdir(resolve(root,"outputs"),{recursive:true});await writeFile(resolve(root,"outputs/reproducible-build.json"),JSON.stringify(result,null,2)+"\n","utf8");console.log(JSON.stringify(result,null,2));if(result.status!=="PASSED")process.exitCode=1;
