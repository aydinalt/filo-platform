#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root=resolve(import.meta.dirname,".."),outputDir=resolve(root,"outputs");
await mkdir(outputDir,{recursive:true});
const sbomArgs=["sbom","--package-lock-only","--sbom-format","cyclonedx","--sbom-type","application"];
const command=process.platform==="win32"?(process.env.ComSpec||"cmd.exe"):"npm";
const commandArgs=process.platform==="win32"?["/d","/s","/c",`npm ${sbomArgs.join(" ")}`]:sbomArgs;
const packages=[
  {cwd:root,file:"sbom.cdx.json"},
  {cwd:resolve(root,"mobile-driver"),file:"sbom-mobile-driver.cdx.json"},
  {cwd:resolve(root,"services/telematics-gateway"),file:"sbom-telematics-gateway.cdx.json"},
];
for(const target of packages){
  const run=spawnSync(command,commandArgs,{cwd:target.cwd,encoding:"utf8",maxBuffer:20*1024*1024});
  if(run.status!==0){process.stderr.write(run.stderr||run.error?.message||`${target.file} üretilemedi.\n`);process.exit(1)}
  JSON.parse(run.stdout);await writeFile(resolve(outputDir,target.file),run.stdout,"utf8");
  console.log(`SBOM_READY outputs/${target.file}`);
}
