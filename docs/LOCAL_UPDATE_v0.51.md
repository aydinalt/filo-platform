# Local update v0.51

This release fails closed when production runtime configuration is incomplete or unsafe.

- Validates the port, session lifetime, cookie flag and web origin before the API starts.
- Requires HTTPS, secure cookies and a PostgreSQL application URL in production.
- Requires strong, non-placeholder session, worker and webhook secrets in production.
- Keeps database URLs and secret values out of returned configuration metadata and errors.
- Adds the missing worker and webhook secret declarations to the Render blueprint.
- Adds focused regression tests for accepted and rejected configurations.
- Allows a valid empty deletion manifest while keeping update manifests non-empty.
- Does not change product behavior or the database schema.

No database migration is required after v0.50.

Upload the files listed in `release-v0.51/update-files.txt`, then run `npm ci` and `npm run release:verify`.
