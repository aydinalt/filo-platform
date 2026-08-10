import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import {
  migrationChecksum,
  runMigrations,
  type MigrationClient,
} from "../src/migration-runner.js";

type RecordedMigration = { checksum: string | null };

function fakeDatabase(initial: Record<string, RecordedMigration> = {}) {
  const ledger = new Map(Object.entries(initial));
  const calls: string[] = [];
  const client: MigrationClient = {
    async query(text, values = []) {
      calls.push(text.trim().split(/\s+/u).slice(0, 3).join(" "));
      if (text.startsWith("SELECT checksum")) {
        const row = ledger.get(String(values[0]));
        return { rowCount: row ? 1 : 0, rows: row ? [row] : [] };
      }
      if (text.startsWith("UPDATE schema_migrations")) {
        ledger.set(String(values[0]), { checksum: String(values[1]) });
      }
      if (text.startsWith("INSERT INTO schema_migrations")) {
        ledger.set(String(values[0]), { checksum: String(values[1]) });
      }
      return { rowCount: 0, rows: [] };
    },
    release() {
      calls.push("release");
    },
  };
  return { pool: { connect: async () => client }, ledger, calls };
}

async function migrationDirectory(sql = "SELECT 1;\n") {
  const directory = await mkdtemp(join(tmpdir(), "filo-migrations-"));
  await writeFile(join(directory, "001_initial.sql"), sql, "utf8");
  return directory;
}

describe("deployment migration runner", () => {
  it("uses stable SHA-256 checksums", () => {
    assert.equal(migrationChecksum("SELECT 1;"), migrationChecksum("SELECT 1;"));
    assert.notEqual(migrationChecksum("SELECT 1;"), migrationChecksum("SELECT 2;"));
  });

  it("locks the ledger, applies a migration transactionally and unlocks", async () => {
    const directory = await migrationDirectory();
    const database = fakeDatabase();
    const applied: string[] = [];

    await runMigrations(database.pool, directory, (name) => applied.push(name));

    assert.deepEqual(applied, ["001_initial.sql"]);
    assert.match(database.ledger.get("001_initial.sql")?.checksum ?? "", /^[a-f0-9]{64}$/u);
    assert.equal(database.calls[0], "SELECT pg_advisory_lock(hashtext($1))");
    assert.deepEqual(database.calls.slice(-2), ["SELECT pg_advisory_unlock(hashtext($1))", "release"]);
    assert.ok(database.calls.includes("BEGIN"));
    assert.ok(database.calls.includes("COMMIT"));
  });

  it("backfills legacy ledger rows without reapplying them", async () => {
    const directory = await migrationDirectory();
    const database = fakeDatabase({ "001_initial.sql": { checksum: null } });

    await runMigrations(database.pool, directory);

    assert.match(database.ledger.get("001_initial.sql")?.checksum ?? "", /^[a-f0-9]{64}$/u);
    assert.equal(database.calls.includes("BEGIN"), false);
  });

  it("stops deployment when an applied migration file changes", async () => {
    const directory = await migrationDirectory("SELECT private_value FROM changed_history;\n");
    const database = fakeDatabase({ "001_initial.sql": { checksum: "0".repeat(64) } });

    await assert.rejects(
      runMigrations(database.pool, directory),
      /Migration integrity check failed for 001_initial\.sql/u,
    );
    assert.equal(database.calls.includes("BEGIN"), false);
    assert.deepEqual(database.calls.slice(-2), ["SELECT pg_advisory_unlock(hashtext($1))", "release"]);
  });
});
