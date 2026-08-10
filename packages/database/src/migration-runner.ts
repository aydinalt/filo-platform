import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const MIGRATION_LOCK = "filo-platform-schema-migrations-v1";

type QueryResult = {
  rowCount: number | null;
  rows: Array<{ checksum?: string | null }>;
};

export type MigrationClient = {
  query: (text: string, values?: unknown[]) => Promise<QueryResult>;
  release: () => void;
};

export type MigrationPool = {
  connect: () => Promise<MigrationClient>;
};

type MigrationFile = {
  name: string;
  sql: string;
  checksum: string;
};

export function migrationChecksum(sql: string) {
  return createHash("sha256").update(sql, "utf8").digest("hex");
}

async function loadMigrations(directory: string): Promise<MigrationFile[]> {
  const names = (await readdir(directory)).filter((name) => name.endsWith(".sql")).sort();
  return Promise.all(
    names.map(async (name) => {
      const sql = await readFile(join(directory, name), "utf8");
      return { name, sql, checksum: migrationChecksum(sql) };
    }),
  );
}

async function prepareMigrationLedger(client: MigrationClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  await client.query("ALTER TABLE schema_migrations ADD COLUMN IF NOT EXISTS checksum text");
}

async function applyMigration(
  client: MigrationClient,
  migration: MigrationFile,
  onApplied: (name: string) => void,
) {
  const applied = await client.query(
    "SELECT checksum FROM schema_migrations WHERE name = $1",
    [migration.name],
  );
  if (applied.rowCount) {
    const recordedChecksum = applied.rows[0]?.checksum;
    if (recordedChecksum && recordedChecksum !== migration.checksum) {
      throw new Error(`Migration integrity check failed for ${migration.name}`);
    }
    if (!recordedChecksum) {
      await client.query("UPDATE schema_migrations SET checksum = $2 WHERE name = $1", [
        migration.name,
        migration.checksum,
      ]);
    }
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)", [
      migration.name,
      migration.checksum,
    ]);
    await client.query("COMMIT");
    onApplied(migration.name);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function runMigrations(
  pool: MigrationPool,
  directory: string,
  onApplied: (name: string) => void = () => undefined,
) {
  const migrations = await loadMigrations(directory);
  const client = await pool.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtext($1))", [MIGRATION_LOCK]);
    locked = true;
    await prepareMigrationLedger(client);
    for (const migration of migrations) {
      await applyMigration(client, migration, onApplied);
    }
  } finally {
    try {
      if (locked) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [MIGRATION_LOCK]);
      }
    } finally {
      client.release();
    }
  }
}
