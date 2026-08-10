# Local update v0.52

This release makes production health signals dependency-aware and adds controlled process shutdown.

- Keeps the lightweight API liveness check separate from readiness.
- Adds a bounded PostgreSQL readiness check with a safe `503` response.
- Points the Render health check at the database-backed readiness endpoint.
- Stops accepting HTTP work before closing the PostgreSQL pool on `SIGTERM` or `SIGINT`.
- Makes repeated shutdown signals idempotent and records shutdown failure without logging private errors.
- Adds smoke and unit coverage for healthy, unavailable and repeated-shutdown behavior.
- Does not change product behavior or the database schema.

No database migration is required after v0.51.

Upload the files listed in `release-v0.52/update-files.txt`, then run `npm ci` and `npm run release:verify`.
