# Local update v0.89

This release delivers the production notification runtime as one connected launch pack.

- Adds a dedicated always-on notification worker workspace.
- Discovers one active operational actor per tenant through a worker-key-protected API.
- Claims and completes tenant-scoped deliveries through the existing lease lifecycle.
- Dispatches real email through Resend while keeping credentials environment-only.
- Retries identical completion receipts after transient API response loss.
- Runs provider health, retention, reconciliation and reminder maintenance on stable keys.
- Deploys API and worker with a shared Render environment group secret.
- Adds a production runbook and bounded worker/runtime tests.
- Adds no database migration, credential value or deletion.

Upload the files listed in `release-v0.89/update-files.txt`.
