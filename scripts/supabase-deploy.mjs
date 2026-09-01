#!/usr/bin/env node
import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const databaseUrl = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("SUPABASE_DATABASE_URL is required. No database changes were made.");
  process.exit(2);
}

const root = resolve(import.meta.dirname, "..");
const migrationDirectory = resolve(root, "supabase/migrations");
const files = (await readdir(migrationDirectory)).filter(name => /^\d+.*\.sql$/u.test(name)).sort();
const client = postgres(databaseUrl, { max: 1, prepare: false, ssl: "require", connect_timeout: 10, idle_timeout: 5 });

function migrationBody(source) {
  return source
    .replace(/^(?:\s*--[^\n]*\n)*\s*BEGIN;\s*/iu, "")
    .replace(/\s*COMMIT;\s*$/iu, "")
    .trim();
}

try {
  await client.unsafe("CREATE SCHEMA IF NOT EXISTS filo_migrations");
  await client.unsafe("CREATE TABLE IF NOT EXISTS filo_migrations.applied (version text PRIMARY KEY, sha256 text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)");
  const pending = [];
  for (const file of files) {
    const source = await readFile(resolve(migrationDirectory, file), "utf8");
    const sha256 = createHash("sha256").update(source).digest("hex");
    const version = file.replace(/\.sql$/u, "");
    const existing = await client`SELECT sha256 FROM filo_migrations.applied WHERE version=${version}`;
    if (existing.length) {
      if (existing[0].sha256 !== sha256) throw new Error(`Applied migration changed: ${file}`);
      continue;
    }
    pending.push(file);
    if (apply) {
      await client.begin(async transaction => {
        await transaction.unsafe(migrationBody(source));
        await transaction`INSERT INTO filo_migrations.applied (version,sha256) VALUES (${version},${sha256})`;
      });
    }
  }

  if (pending.length && !apply) {
    console.log(JSON.stringify({
      format: "FILO_SUPABASE_DEPLOYMENT_V1",
      mode: "VERIFY",
      status: "MIGRATIONS_PENDING",
      migrationCount: files.length,
      pending,
      checks: { migrationsApplied: false },
      secretValuesIncluded: false,
    }, null, 2));
    process.exitCode = 2;
  } else {
    const [rls, policies, grants, bucket, scheduler, history] = await Promise.all([
    client`SELECT count(*)::int AS count FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND EXISTS (SELECT 1 FROM information_schema.columns x WHERE x.table_schema='public' AND x.table_name=c.relname AND x.column_name='tenant_id') AND NOT c.relrowsecurity`,
    client`SELECT count(*)::int AS count FROM pg_policies WHERE schemaname='public' AND policyname LIKE 'tenant_%'`,
    client`SELECT count(*)::int AS count FROM information_schema.role_table_grants WHERE table_schema='public' AND grantee IN ('anon','authenticated') AND privilege_type IN ('INSERT','UPDATE','DELETE')`,
    client`SELECT public FROM storage.buckets WHERE id='filo-private'`,
    client`SELECT count(*)::int AS count FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='configure_operations_tick'`,
    client`SELECT count(*)::int AS count FROM filo_migrations.applied`,
  ]);
    const checks = {
      migrationsApplied: Number(history[0]?.count || 0) === files.length,
      tenantTablesWithoutRls: Number(rls[0]?.count || 0),
      tenantPolicyCount: Number(policies[0]?.count || 0),
      directAuthenticatedWriteGrants: Number(grants[0]?.count || 0),
      privateStorageBucket: bucket[0]?.public === false,
      operationsSchedulerInstalled: Number(scheduler[0]?.count || 0) === 1,
    };
    const passed = checks.migrationsApplied && checks.tenantTablesWithoutRls === 0 && checks.tenantPolicyCount >= 43 && checks.directAuthenticatedWriteGrants === 0 && checks.privateStorageBucket && checks.operationsSchedulerInstalled;
    console.log(JSON.stringify({ format: "FILO_SUPABASE_DEPLOYMENT_V1", mode: apply ? "APPLY" : "VERIFY", status: passed ? "PASSED" : "FAILED", migrationCount: files.length, pending, checks, secretValuesIncluded: false }, null, 2));
    if (!passed) process.exitCode = 2;
  }
} finally {
  await client.end({ timeout: 2 });
}
