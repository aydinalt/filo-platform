import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const adminPool = new pg.Pool({
  connectionString: process.env.DATABASE_ADMIN_URL ?? process.env.DATABASE_URL
});

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");
await adminPool.query(`
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`);

for (const name of (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort()) {
  const applied = await adminPool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name]);
  if (applied.rowCount) continue;
  const sql = await readFile(join(migrationsDir, name), "utf8");
  const client = await adminPool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations(name) VALUES ($1)", [name]);
    await client.query("COMMIT");
    console.log(`Applied ${name}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
await adminPool.end();
