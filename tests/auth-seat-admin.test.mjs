import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";

const root=resolve(import.meta.dirname,".."),read=path=>readFile(resolve(root,path),"utf8");
async function importTypeScript(path){const source=await read(path),transpiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import(`data:text/javascript;base64,${Buffer.from(transpiled).toString("base64")}`)}

test("isolated demo credentials use hashes and signed expiring sessions",async()=>{
  const demo=await importTypeScript("lib/demo-auth.ts"),env={APP_ENV:"test",FILO_DEMO_AUTH_ENABLED:"true",FILO_DEMO_SESSION_SECRET:"test-secret-that-is-long-enough-for-signing"};
  assert.equal((await demo.verifyDemoCredentials(env,"demo1","demo1"))?.username,"demo1");
  assert.equal((await demo.verifyDemoCredentials(env,"demo2","demo2"))?.username,"demo2");
  assert.equal(await demo.verifyDemoCredentials(env,"demo1","wrong"),null);
  const account=await demo.verifyDemoCredentials(env,"demo1","demo1"),base=1_800_000_000_000;
  const session=await demo.createDemoSession(env,account,base);
  assert.equal((await demo.readDemoSession(env,session,base+1000))?.username,"demo1");
  assert.equal(await demo.readDemoSession(env,`${session}x`,base+1000),null);
  assert.equal(await demo.readDemoSession(env,session,base+(demo.DEMO_SESSION_MAX_AGE_SECONDS+1)*1000),null);
  const source=await read("lib/demo-auth.ts");assert.doesNotMatch(source,/password\s*:\s*["']demo[12]["']/i);
});

test("member activation is blocked until a paid user seat is available",async()=>{
  const store=await read("lib/platform-store.ts");
  assert.match(store,/requestedActive&&\(!current\|\|!current\.active\)/);
  assert.match(store,/USER_SEAT_REQUIRED/);
  assert.match(store,/status='COMPLETED'/);
  assert.match(store,/order\?Math\.max\(1,Number\(order\.seats\)\)/);
  assert.match(store,/PENDING_LICENSE/);
  assert.match(store,/inactiveMembership[\s\S]*ACCOUNT_INACTIVE/);
});

test("platform admin is allowlisted and every write requires Supabase AAL2",async()=>{
  const [admin,route,page]=await Promise.all([read("lib/platform-admin.ts"),read("app/api/admin/route.ts"),read("app/page.tsx")]);
  assert.match(admin,/isPlatformAdminEmail\(identity\.email,env\)/);
  assert.match(admin,/identity\.authSource!=="SUPABASE"\|\|identity\.assuranceLevel!=="aal2"/);
  assert.match(admin,/PLATFORM_ADMIN_MEMBER_UPDATED/);
  assert.match(route,/requirePlatformAdmin\(true\)/);
  assert.match(page,/snapshot\.workspace\.isPlatformAdmin/);
  assert.match(page,/router\.push\("\/admin"\)/);
  assert.match(page,/purchase-demo-seats/);
});
