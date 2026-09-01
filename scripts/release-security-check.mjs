#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { extname } from "node:path";

const tracked=execFileSync("git",["ls-files","--cached","--others","--exclude-standard","-z"],{encoding:"utf8"}).split("\0").filter(Boolean);
const forbiddenEnv=tracked.filter(file=>/(^|\/)\.env(?:\.|$)/u.test(file)&&!file.endsWith(".env.example")&&!file.endsWith("/.env.example"));
const binary=new Set([".png",".jpg",".jpeg",".gif",".webp",".woff",".woff2",".zip",".gz",".pdf"]);
const patterns=[
  ["PRIVATE_KEY",/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u],
  ["AWS_ACCESS_KEY",/AKIA[0-9A-Z]{16}/u],
  ["GITHUB_TOKEN",/(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})/u],
  ["OPENAI_KEY",/sk-[A-Za-z0-9_-]{32,}/u],
  ["STRIPE_LIVE_KEY",/(?:sk|rk)_live_[A-Za-z0-9]{20,}/u],
];
const scannerSources=new Set(["scripts/release-security-check.mjs","scripts/verify-production-evidence-pack.mjs","tests/production-evidence-pack.test.mjs"]);
const findings=forbiddenEnv.map(file=>({file,kind:"TRACKED_ENV_FILE"}));
for(const file of tracked){
  if(binary.has(extname(file).toLowerCase())||scannerSources.has(file))continue;
  const info=await stat(file).catch(()=>null);if(!info||info.size>1024*1024)continue;
  const content=await readFile(file,"utf8").catch(()=>"");
  for(const [kind,pattern] of patterns)if(pattern.test(content))findings.push({file,kind});
}
const result={format:"FILO_REPOSITORY_SECURITY_SCAN_V1",status:findings.length?"BLOCKED":"PASSED",trackedFiles:tracked.length,findings};
console.log(JSON.stringify(result,null,2));
if(findings.length)process.exitCode=1;
