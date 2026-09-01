import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));

test("release workflow contains quality, SCA, CodeQL, Supabase and reproducibility gates",async()=>{
  const workflow=await readFile(resolve(root,".github/workflows/release-gates.yml"),"utf8");
  for(const marker of ["quality-and-artifact", "dependency-review", "software-composition", "codeql", "reproducible-build", "supabase-database", "pg_prove", "npm run ci:verify", "npm audit --omit=dev --audit-level=high"])assert.match(workflow,new RegExp(marker,"u"));
});

test("environment profiles isolate data and provider modes",async()=>{
  const profiles=[];
  for(const name of ["development","staging","production"]){profiles.push(JSON.parse(await readFile(resolve(root,"config/environments",`${name}.json`),"utf8")))}
  assert.deepEqual(profiles.map(profile=>profile.name),["development","staging","production"]);
  assert.deepEqual(profiles.map(profile=>profile.providerMode),["SANDBOX_OR_DISABLED","SANDBOX","LIVE"]);
  assert.ok(profiles.every(profile=>profile.isolatedResources.includes("D1")&&profile.isolatedResources.includes("R2")));
});

test("production preflight accepts a complete contract without revealing secrets",()=>{
  const secret="A".repeat(40),env={...process.env,APP_ENV:"PRODUCTION",ENVIRONMENT_ID:"filo-production",PUBLIC_APP_ORIGIN:"https://fleet.invalid",D1_ENVIRONMENT_ID:"filo-production-d1",R2_ENVIRONMENT_ID:"filo-production-r2",SECRETS_ROTATED_AT:new Date().toISOString(),SECRET_ROTATION_OWNER:"PLATFORM-OPS",SECRET_MAX_AGE_DAYS:"90",LEGAL_CONTROLLER_NAME:"FILO PLATFORM AŞ",LEGAL_CONTROLLER_EMAIL:"legal@fleet.invalid",LEGAL_CONTROLLER_ADDRESS:"ISTANBUL",LEGAL_TERMS_EFFECTIVE_AT:"2026-08-24",PUBLIC_SIGNUP_ENABLED:"true",OPERATIONS_CRON_SECRET:secret,MALWARE_SCAN_PROVIDER:"CLOUDMERSIVE",CLOUDMERSIVE_API_KEY:secret,ESIGN_API_KEY:secret,ESIGN_WEBHOOK_SECRET:secret,VEHICLE_CATALOG_PROVIDER:"CUSTOM_HTTP_V1",VEHICLE_CATALOG_API_URL:"https://vin.invalid/decode",VEHICLE_CATALOG_API_KEY:secret,VEHICLE_CATALOG_ALLOWED_HOSTS:"vin.invalid",EINVOICE_API_URL:"https://invoice.invalid/issue",EINVOICE_API_KEY:secret,EINVOICE_WEBHOOK_SECRET:secret,PAYMENT_API_URL:"https://pay.invalid/checkout",PAYMENT_API_KEY:secret,PAYMENT_WEBHOOK_SECRET:secret,PAYMENT_CHECKOUT_HOSTS:"pay.invalid",RESEND_API_KEY:secret,RESEND_WEBHOOK_SECRET:secret,RESEND_FROM:"Filo <notify@fleet.invalid>",EXPO_ACCESS_TOKEN:secret,EXPO_PROJECT_ID:"12345678-1234-4abc-8def-123456789abc",TRACKER_GATEWAY_MODE:"DEVICE_TOKEN",DEVICE_TOKEN_MAX_AGE_DAYS:"30",MAP_PROVIDER:"OPENSTREETMAP",MAP_ALLOWED_HOSTS:"www.openstreetmap.org,tile.openstreetmap.org"};
  Object.assign(env,{OPERATIONS_ALERT_EMAILS:"oncall@fleet.invalid",BROWSER_TELEMETRY_ENABLED:"false"});
  const run=spawnSync(process.execPath,[resolve(root,"scripts/production-preflight.mjs"),"--json","--strict","--environment=production"],{cwd:root,env,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);const output=JSON.parse(run.stdout);assert.equal(output.status,"READY_FOR_LIVE_PROOF");assert.equal(output.secretValuesIncluded,false);assert.doesNotMatch(run.stdout,new RegExp(secret,"u"));
});

test("production preflight accepts the Vercel Supabase contract without requiring D1 or R2",()=>{
  const secret="B".repeat(40),origin="https://fleet.invalid",env={...process.env,APP_ENV:"PRODUCTION",ENVIRONMENT_ID:"filo-production",PUBLIC_APP_ORIGIN:origin,FILO_RUNTIME:"supabase",NEXT_PUBLIC_SUPABASE_URL:"https://project.supabase.co",NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:`sb_publishable_${secret}`,SUPABASE_SERVICE_ROLE_KEY:secret,SUPABASE_DATABASE_URL:"postgresql://postgres:password@db.invalid:5432/postgres",SUPABASE_STORAGE_BUCKET:"filo-private",SUPABASE_CRON_MODE:"PG_CRON",SUPABASE_AUTH_SITE_URL:origin,SUPABASE_AUTH_ALLOWED_REDIRECTS:`${origin}/auth/callback`,SUPABASE_AUTH_EMAIL_CONFIRMATION_REQUIRED:"true",SUPABASE_AUTH_CUSTOM_SMTP_ENABLED:"true",SUPABASE_AUTH_CAPTCHA_ENABLED:"true",NEXT_PUBLIC_SUPABASE_REQUIRE_CAPTCHA:"true",NEXT_PUBLIC_TURNSTILE_SITE_KEY:"0x4AAAA-production-site-key",SUPABASE_AUTH_RATE_LIMIT_EMAILS_PER_HOUR:"30",SUPABASE_AUTH_PASSWORD_MIN_LENGTH:"10",SECRETS_ROTATED_AT:new Date().toISOString(),SECRET_ROTATION_OWNER:"PLATFORM-OPS",SECRET_MAX_AGE_DAYS:"90",LEGAL_CONTROLLER_NAME:"FILO PLATFORM AŞ",LEGAL_CONTROLLER_EMAIL:"legal@fleet.invalid",LEGAL_CONTROLLER_ADDRESS:"ISTANBUL",LEGAL_TERMS_EFFECTIVE_AT:"2026-08-24",PUBLIC_SIGNUP_ENABLED:"true",OPERATIONS_CRON_SECRET:secret,MALWARE_SCAN_PROVIDER:"CLOUDMERSIVE",CLOUDMERSIVE_API_KEY:secret,ESIGN_API_KEY:secret,ESIGN_WEBHOOK_SECRET:secret,VEHICLE_CATALOG_PROVIDER:"CUSTOM_HTTP_V1",VEHICLE_CATALOG_API_URL:"https://vin.invalid/decode",VEHICLE_CATALOG_API_KEY:secret,VEHICLE_CATALOG_ALLOWED_HOSTS:"vin.invalid",EINVOICE_API_URL:"https://invoice.invalid/issue",EINVOICE_API_KEY:secret,EINVOICE_WEBHOOK_SECRET:secret,PAYMENT_API_URL:"https://pay.invalid/checkout",PAYMENT_API_KEY:secret,PAYMENT_WEBHOOK_SECRET:secret,PAYMENT_CHECKOUT_HOSTS:"pay.invalid",RESEND_API_KEY:secret,RESEND_WEBHOOK_SECRET:secret,RESEND_FROM:"Filo <notify@fleet.invalid>",EXPO_ACCESS_TOKEN:secret,EXPO_PROJECT_ID:"12345678-1234-4abc-8def-123456789abc",TRACKER_GATEWAY_MODE:"DEVICE_TOKEN",DEVICE_TOKEN_MAX_AGE_DAYS:"30",MAP_PROVIDER:"OPENSTREETMAP",MAP_ALLOWED_HOSTS:"www.openstreetmap.org,tile.openstreetmap.org"};
  Object.assign(env,{OPERATIONS_ALERT_EMAILS:"oncall@fleet.invalid",BROWSER_TELEMETRY_ENABLED:"false",PRIVILEGED_MFA_REQUIRED:"true"});
  const run=spawnSync(process.execPath,[resolve(root,"scripts/production-preflight.mjs"),"--json","--strict","--environment=production"],{cwd:root,env,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);const output=JSON.parse(run.stdout);assert.equal(output.runtime,"supabase");assert.equal(output.status,"READY_FOR_LIVE_PROOF");assert.doesNotMatch(run.stdout,/D1_ENVIRONMENT_ID|R2_ENVIRONMENT_ID/u);assert.doesNotMatch(run.stdout,new RegExp(secret,"u"));
});

test("repository security and migration checks pass",()=>{
  for(const script of ["release-security-check.mjs","migration-lint.mjs"]){const run=spawnSync(process.execPath,[resolve(root,"scripts",script)],{cwd:root,encoding:"utf8"});assert.equal(run.status,0,run.stderr||run.stdout)}
});

test("release gates 4-15 have one canonical contract and executable validation",async()=>{
  const config=JSON.parse(await readFile(resolve(root,"config/release-gates-04-15.json"),"utf8"));
  assert.deepEqual(config.gates.map(gate=>gate.order),Array.from({length:12},(_,index)=>index+4));
  assert.equal(new Set(config.gates.map(gate=>gate.id)).size,12);
  const run=spawnSync(process.execPath,[resolve(root,"scripts/validate-release-gates.mjs")],{cwd:root,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(run.stdout);
  assert.equal(result.softwareStatus,"PASSED");
  assert.equal(result.evidenceStatus,"EXTERNAL_EVIDENCE_REQUIRED");
  assert.equal(result.secretValuesIncluded,false);
});

test("go-live validation refuses to self-certify without real evidence",()=>{
  const run=spawnSync(process.execPath,[resolve(root,"scripts/validate-release-gates.mjs"),"--go-live"],{cwd:root,encoding:"utf8"});
  assert.notEqual(run.status,0);
  const result=JSON.parse(run.stdout);
  assert.equal(result.status,"BLOCKED");
  assert.match(result.blockers.join(" "),/manifest/u);
});

test("technical go-live plan covers steps 2-15 while legal remains a general-release blocker",async()=>{
  const plan=JSON.parse(await readFile(resolve(root,"config/technical-go-live-plan.json"),"utf8"));
  assert.deepEqual(plan.steps.map(step=>step.order),Array.from({length:14},(_,index)=>index+2));
  assert.equal(plan.legalGateDeferred,true);
  assert.equal(plan.generalReleaseBlockedUntilLegalApproval,true);
  const run=spawnSync(process.execPath,[resolve(root,"scripts/technical-go-live-audit.mjs")],{cwd:root,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(run.stdout);
  assert.equal(result.softwareStatus,"PASSED");
  assert.equal(result.technicalStatus,"EXTERNAL_ACTION_REQUIRED");
});

test("capacity and controlled rollout limits are executable release policy",()=>{
  const run=spawnSync(process.execPath,[resolve(root,"scripts/validate-capacity-budget.mjs")],{cwd:root,encoding:"utf8"});
  assert.equal(run.status,0,run.stderr||run.stdout);
  const result=JSON.parse(run.stdout);
  assert.equal(result.status,"PASSED");
  assert.deepEqual(result.budget.rollout.map(step=>step.trafficPercent),[0,5,25,100]);
});
