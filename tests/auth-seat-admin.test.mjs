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
  assert.equal((await demo.verifyDemoCredentials(env,"aydinalt@gmail.com","5614452"))?.username,"admin");
  assert.equal(await demo.verifyDemoCredentials(env,"demo1","wrong"),null);
  const account=await demo.verifyDemoCredentials(env,"demo1","demo1"),base=1_800_000_000_000;
  const session=await demo.createDemoSession(env,account,base);
  assert.equal((await demo.readDemoSession(env,session,base+1000))?.username,"demo1");
  assert.equal(await demo.readDemoSession(env,`${session}x`,base+1000),null);
  assert.equal(await demo.readDemoSession(env,session,base+(demo.DEMO_SESSION_MAX_AGE_SECONDS+1)*1000),null);
  const source=await read("lib/demo-auth.ts");assert.doesNotMatch(source,/password\s*:\s*["'](?:demo[12]|5614452)["']/i);
  assert.equal(demo.demoAuthEnabled({...env,FILO_DEPLOYMENT_TIER:"production"}),false);
  assert.equal(await demo.verifyDemoCredentials({...env,FILO_DEPLOYMENT_TIER:"production"},"demo1","demo1"),null);
});

test("production tier rejects prototype identity paths",async()=>{
  const boundary=await importTypeScript("lib/auth-boundary.ts");
  assert.equal(boundary.shouldAcceptSitesIdentityHeaders("cloudflare","prototype"),true);
  assert.equal(boundary.shouldAcceptSitesIdentityHeaders("cloudflare","production"),false);
  assert.equal(boundary.shouldAcceptSitesIdentityHeaders("supabase","prototype"),false);
  const browser=await read("app/supabase-browser.ts"),page=await read("app/page.tsx");
  assert.match(browser,/demoAuthAvailable = deploymentTier === "prototype"/);
  assert.match(page,/isDemo&&demoAuthAvailable/);
  assert.match(page,/Üretim kimlik doğrulaması henüz yapılandırılmadı/);
});

test("member activation is blocked until a paid user seat is available",async()=>{
  const store=await read("lib/platform-store.ts");
  assert.match(store,/const activating=requestedActive&&\(!current\|\|!current\.active\)/);
  assert.match(store,/USER_SEAT_REQUIRED/);
  assert.match(store,/status='COMPLETED'/);
  assert.match(store,/order\?Math\.max\(1,Number\(order\.seats\)\)/);
  assert.match(store,/PENDING_LICENSE/);
  assert.match(store,/inactiveMembership[\s\S]*ACCOUNT_INACTIVE/);
  assert.match(store,/SELECT COUNT\(\*\) FROM tenant_members WHERE tenant_id=\? AND active=1\)<\?/);
  assert.match(store,/memberResult\.meta\.changes/);
});

test("platform admin is allowlisted, production reads and writes require AAL2, and demo admin stays isolated",async()=>{
  const [admin,route,page,adminPage,browser]=await Promise.all([read("lib/platform-admin.ts"),read("app/api/admin/route.ts"),read("app/page.tsx"),read("app/admin/page.tsx"),read("app/supabase-browser.ts")]);
  assert.match(admin,/isPlatformAdminEmail\(identity\.email,env\)/);
  assert.match(admin,/identity\.authSource!=="SUPABASE"\|\|identity\.assuranceLevel!=="aal2"/);
  assert.match(admin,/PLATFORM_ADMIN_MEMBER_UPDATED/);
  assert.match(admin,/identity\.authSource==="DEMO"&&tenantId!=="TEN-DEMO"/);
  assert.match(admin,/const demoTenantId=identity\.authSource==="DEMO"\?"TEN-DEMO":null/);
  assert.match(admin,/await ensureDemoWorkspaceRows\(env\.DB\)/);
  assert.match(route,/requirePlatformAdmin\(true\)/);
  assert.match(page,/snapshot\.workspace\.isPlatformAdmin/);
  assert.match(page,/router\.push\("\/admin"\)/);
  assert.match(page,/account\.username==="admin"/);
  assert.match(page,/purchase-demo-seats/);
  assert.match(browser,/return result\.account/);
  assert.match(adminPage,/operator\.authSource==="DEMO"\)await signOutDemo/);
  assert.match(adminPage,/MFA_REQUIRED/);
});
