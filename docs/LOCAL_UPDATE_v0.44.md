# Local update v0.44

This release adds a tenant-scoped, read-only health summary for reconciliation reminder maintenance.

- Reports active reminder scans and scans still running after the fixed 15-minute interruption threshold.
- Exposes the oldest active scan and the latest completed maintenance time.
- Uses bounded `healthy`, `running`, and `attention` states.
- Shows the summary only inside the existing owner, admin, and operator retention view.
- Does not start maintenance, retry work, create notifications, or delete data.

No database migration is required after v0.43. The summary uses the existing reminder-run and maintenance-run tables.

Validation completed with TypeScript checks, 49 tests, and API/web production builds.
