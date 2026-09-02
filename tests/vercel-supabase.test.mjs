import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source=readFileSync(new URL("../lib/sql-compat.ts",import.meta.url),"utf8");
const transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const localizedModule=await import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`);
const migration=readFileSync(new URL("../supabase/migrations/20260826000100_filo_initial.sql",import.meta.url),"utf8");
const scheduler=readFileSync(new URL("../supabase/migrations/20260827000100_operations_scheduler.sql",import.meta.url),"utf8");
const rlsTest=readFileSync(new URL("../supabase/tests/database/tenant_isolation.test.sql",import.meta.url),"utf8");
const page=readFileSync(new URL("../app/page.tsx",import.meta.url),"utf8");
const captcha=readFileSync(new URL("../app/AuthCaptcha.tsx",import.meta.url),"utf8");
const auth=readFileSync(new URL("../app/chatgpt-auth.ts",import.meta.url),"utf8");
const cron=readFileSync(new URL("../app/api/system/operations-tick/route.ts",import.meta.url),"utf8");
const vercel=JSON.parse(readFileSync(new URL("../vercel.json",import.meta.url),"utf8"));

test("PostgreSQL compatibility converts D1 placeholders, conflicts, JSON and aliases",()=>{
  const {normalizeSqliteQuery}=localizedModule;
  assert.equal(normalizeSqliteQuery("SELECT tenant_id AS tenantId FROM tenants WHERE id=?"),'SELECT tenant_id AS "tenantId" FROM tenants WHERE id=$1');
  assert.match(normalizeSqliteQuery("INSERT OR IGNORE INTO teams (id,name) VALUES (?,?)"),/INSERT INTO teams \(id,name\) VALUES \(\$1,\$2\) ON CONFLICT DO NOTHING/);
  const jsonExtract=normalizeSqliteQuery("SELECT json_extract(data,'$.plate') AS plate FROM module_records WHERE tenant_id=?");
  assert.match(jsonExtract,/jsonb_typeof\(\(data\)::jsonb\) = 'string'/);
  assert.match(jsonExtract,/\(data\)::jsonb ->> 'plate'/);
  assert.match(jsonExtract,/#>> '\{\}'\)::jsonb ->> 'plate'/);
  assert.match(normalizeSqliteQuery("SELECT id FROM module_records WHERE id IN (SELECT value FROM json_each(?))"),/SELECT jsonb_array_elements_text\(\$1::jsonb\)/);
});

test("Supabase migration contains PostGIS, private storage and tenant RLS",()=>{
  assert.match(migration,/CREATE EXTENSION IF NOT EXISTS postgis/);
  assert.match(migration,/ALTER TABLE public\."module_records" ENABLE ROW LEVEL SECURITY/);
  assert.match(migration,/CREATE OR REPLACE FUNCTION public\.is_tenant_member/);
  assert.match(migration,/SECURITY DEFINER/);
  assert.match(migration,/public\.is_tenant_member\("module_records"\.tenant_id\)/);
  assert.match(migration,/"captured_at" timestamptz NOT NULL/);
  assert.match(migration,/REVOKE ALL ON public\."module_records" FROM anon, authenticated/);
  assert.match(migration,/VALUES \('filo-private', 'filo-private', false\)/);
  assert.doesNotMatch(migration,/public\s*=\s*true/i);
});

test("Vercel target exposes hardened Supabase auth and a signed cron path",()=>{
  assert.equal(vercel.framework,"nextjs");
  assert.equal(vercel.buildCommand,"npm run build:vercel");
  assert.match(page,/signInWithPassword/);
  assert.match(page,/signUpWithPassword/);
  assert.match(page,/sendPasswordReset/);
  assert.match(page,/AuthCaptcha/);
  assert.match(captcha,/challenges\.cloudflare\.com\/turnstile/);
  assert.match(auth,/client\.auth\.getUser\(\)/);
  assert.match(cron,/export async function GET\(request:Request\)\{return executeTick\(request\)\}/);
  assert.match(cron,/constantTimeTokenMatch/);
  assert.equal(vercel.crons,undefined);
  assert.match(scheduler,/CREATE EXTENSION IF NOT EXISTS pg_cron/);
  assert.match(scheduler,/filo-operations-quarter-hour/);
  assert.match(scheduler,/vault\.create_secret/);
});

test("Supabase database tests cover two tenants and deny direct writes",()=>{
  assert.match(rlsTest,/alpha@example\.com/);
  assert.match(rlsTest,/beta@example\.com/);
  assert.match(rlsTest,/direct inserts are denied/);
  assert.match(rlsTest,/direct updates are denied/);
  assert.match(rlsTest,/direct deletes are denied/);
  assert.match(rlsTest,/anonymous users cannot read tenant identities/);
});
