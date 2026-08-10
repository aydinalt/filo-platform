import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { runMigrations } from "./migration-runner.js";

function databaseUrl() {
  const value = process.env.DATABASE_ADMIN_URL || process.env.DATABASE_URL;
  if (!value) throw new Error("Migration database URL is missing or invalid");
  try {
    const parsed = new URL(value);
    if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
      throw new Error();
    }
  } catch {
    throw new Error("Migration database URL is missing or invalid");
  }
  return value;
}

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), "../migrations");

async function main() {
  let adminPool: pg.Pool | undefined;
  try {
    adminPool = new pg.Pool({
      connectionString: databaseUrl(),
      connectionTimeoutMillis: 10_000,
      max: 1,
    });
    await runMigrations(adminPool, migrationsDir, (name) => console.log(`Applied ${name}`));
  } catch {
    console.error("Database migration failed; API startup has been stopped.");
    process.exitCode = 1;
  } finally {
    await adminPool?.end();
  }
}

await main();
