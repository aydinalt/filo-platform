#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import postgres from "postgres";
import ts from "typescript";

const root = resolve(import.meta.dirname, "..");
const workRoot = resolve(root, "work");
await mkdir(workRoot, { recursive: true });
const moduleRoot = await mkdtemp(resolve(workRoot, "supabase-runtime-"));

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
}

async function loadAdapter() {
  const compatibility = await readFile(resolve(root, "lib/sql-compat.ts"), "utf8");
  const runtime = (await readFile(resolve(root, "lib/supabase-runtime.ts"), "utf8"))
    .replace('from "./sql-compat"', 'from "./sql-compat.mjs"');
  await writeFile(resolve(moduleRoot, "sql-compat.mjs"), transpile(compatibility));
  await writeFile(resolve(moduleRoot, "supabase-runtime.mjs"), transpile(runtime));
  return import(pathToFileURL(resolve(moduleRoot, "supabase-runtime.mjs")).href);
}

const sql = postgres({
  host: process.env.PGHOST || "127.0.0.1",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "postgres",
  username: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "",
  max: 1,
  prepare: false,
  ssl: false,
});

try {
  const { createPostgresD1Adapter } = await loadAdapter();
  const DB = createPostgresD1Adapter(sql);
  await sql.unsafe("CREATE TEMP TABLE filo_adapter_smoke (id text PRIMARY KEY, tenant_id text NOT NULL, data jsonb NOT NULL)");

  const inserted = await DB.prepare("INSERT OR IGNORE INTO filo_adapter_smoke (id,tenant_id,data) VALUES (?,?,?)")
    .bind("REC-1", "TENANT-A", JSON.stringify({ plate: "34FILO34" })).run();
  assert.equal(inserted.success, true);
  const duplicate = await DB.prepare("INSERT OR IGNORE INTO filo_adapter_smoke (id,tenant_id,data) VALUES (?,?,?)")
    .bind("REC-1", "TENANT-A", JSON.stringify({ plate: "IGNORED" })).run();
  assert.equal(duplicate.meta.changes, 0);

  const row = await DB.prepare("SELECT tenant_id AS tenantId, json_extract(data,'$.plate') AS plate FROM filo_adapter_smoke WHERE id=?")
    .bind("REC-1").first();
  assert.deepEqual(row, { tenantId: "TENANT-A", plate: "34FILO34" });

  await assert.rejects(DB.batch([
    DB.prepare("INSERT INTO filo_adapter_smoke (id,tenant_id,data) VALUES (?,?,?)").bind("REC-2", "TENANT-A", "{}"),
    DB.prepare("INSERT INTO filo_adapter_smoke (id,tenant_id,data) VALUES (?,?,?)").bind("REC-2", "TENANT-A", "{}"),
  ]));
  const rolledBack = await DB.prepare("SELECT COUNT(*) AS count FROM filo_adapter_smoke WHERE id=?").bind("REC-2").first();
  assert.equal(Number(rolledBack?.count || 0), 0);
  console.log("SUPABASE_RUNTIME_INTEGRATION_PASSED");
} finally {
  await sql.end({ timeout: 5 }).catch(() => undefined);
  await rm(moduleRoot, { recursive: true, force: true });
}
