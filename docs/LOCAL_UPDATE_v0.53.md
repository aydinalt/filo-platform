# Local update v0.53

This release makes database migration a fail-closed part of API deployment.

- Runs the compiled migration command before Render starts the API.
- Serializes concurrent deployment attempts with a PostgreSQL advisory lock.
- Stores a SHA-256 checksum for every applied migration and rejects later file drift.
- Backfills checksums for legacy migration ledger rows without reapplying SQL.
- Uses the migration-owner connection when configured and keeps the application connection separate.
- Releases the migration lock and database client on both success and failure.
- Adds database-package tests for locking, transactional application, legacy backfill and drift rejection.
- Does not add a product migration or change application behavior.

No new SQL migration is required after v0.52. On the first deployment, the migration ledger receives checksum metadata for the existing 39 migration files.

Upload the files listed in `release-v0.53/update-files.txt`, configure `DATABASE_ADMIN_URL` in Render, then deploy. The start command applies pending migrations before starting the API.
