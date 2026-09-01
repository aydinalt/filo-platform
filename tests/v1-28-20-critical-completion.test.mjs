import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root=resolve(import.meta.dirname,".."),read=path=>readFile(resolve(root,path),"utf8");

test("production flags are case-safe and provider dispatch is privileged",async()=>{const [store,telemetry,provider]=await Promise.all([read("lib/platform-store.ts"),read("app/api/telemetry/route.ts"),read("app/api/provider-dispatch/route.ts")]);assert.match(store,/String\(env\.APP_ENV\|\|""\)\.toLowerCase\(\)==="production"/);assert.match(store,/String\(env\.FILO_RUNTIME\|\|""\)\.toLowerCase\(\)==="supabase"/);assert.match(telemetry,/String\(env\.APP_ENV\|\|""\)\.toLowerCase\(\)==="production"/);assert.match(provider,/requirePrivilegedAccess\(workspace,`provider-dispatch:/)});

test("public signup consent is carried by Supabase and verified before tenant creation",async()=>{const [browser,auth,store]=await Promise.all([read("app/supabase-browser.ts"),read("app/chatgpt-auth.ts"),read("lib/platform-store.ts")]);for(const marker of ["FILO_PUBLIC_SIGNUP_V1","filo_terms_version","filo_privacy_version","filo_accepted_at"])assert.match(browser,new RegExp(marker));assert.match(auth,/signupAcceptance/);assert.match(store,/SUPABASE_SIGNUP_METADATA/);assert.match(store,/Date\.now\(\)-acceptedAt>24\*60\*60\*1000/);assert.match(store,/APP_ENV\|\|""\)\.toLowerCase\(\)==="production"&&identity\.authSource!=="SUPABASE"/)});

test("MFA removal requires a fresh AAL2 session",async()=>{const browser=await read("app/supabase-browser.ts");assert.match(browser,/removeMfaFactor[\s\S]*getAuthenticatorAssuranceLevel/);assert.match(browser,/currentLevel!=="aal2"/);assert.match(browser,/auth\.mfa\.unenroll/)});

test("operations scheduler rotates instead of starving tenants after the first hundred",async()=>{const [store,tick]=await Promise.all([read("lib/platform-store.ts"),read("app/api/system/operations-tick/route.ts")]);assert.match(store,/offset=\(slotIndex\*safeLimit\)%total/);assert.match(store,/nextOffset:\(offset\+safeLimit\)%total/);assert.match(tick,/rotationOffset/);assert.match(tick,/totalTenants/)});

test("final evidence rejects symlink escape",async()=>{const evidenceRoot=await mkdtemp(resolve(tmpdir(),"filo-evidence-root-")),outside=resolve(evidenceRoot,"..",`filo-outside-${process.pid}.txt`);try{const bytes=Buffer.from("outside signed evidence");await writeFile(outside,bytes);await symlink(outside,resolve(evidenceRoot,"observability.txt"));const manifest={format:"FILO_FINAL_PRODUCTION_EVIDENCE_V3",release:"1.28.20",environment:"production",gates:[{id:"OBSERVABILITY",status:"PASSED",executedAt:new Date().toISOString(),approver:"Operations Approver",metrics:{monitoringHours:24,openCritical:0,deliveryTestPassed:true,maximumSnapshotGapMinutes:15},evidence:[{relativePath:"observability.txt",sha256:createHash("sha256").update(bytes).digest("hex"),sizeBytes:bytes.length,scanStatus:"CLEAN"}]}]},manifestPath=resolve(evidenceRoot,"manifest.json");await writeFile(manifestPath,JSON.stringify(manifest));const run=spawnSync(process.execPath,[resolve(root,"scripts/validate-final-production-readiness.mjs"),"--strict",`--manifest=${manifestPath}`,`--evidence-root=${evidenceRoot}`],{cwd:root,encoding:"utf8"}),result=JSON.parse(run.stdout);assert.notEqual(run.status,0);assert.match(result.blockers.join(" "),/sembolik bağlantı/u)}finally{await rm(evidenceRoot,{recursive:true,force:true});await rm(outside,{force:true})}});
