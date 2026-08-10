# Local update v0.67

This release prevents API responses containing session or tenant data from being cached.

- Adds `Cache-Control: no-store` to every response under the `/api` boundary.
- Covers successful, rejected, authentication, provider webhook and internal worker responses.
- Applies the header at the final response stage so route outcomes cannot omit it.
- Keeps health endpoints outside the tenant-data cache boundary.
- Adds release-smoke coverage for protected and successful API responses.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.67/update-files.txt`.
