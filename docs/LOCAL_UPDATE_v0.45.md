# Local update v0.45

This release adds tenant-scoped freshness monitoring to reconciliation reminder maintenance health.

- Marks health as requiring attention when maintenance has never completed.
- Marks health as requiring attention when the last completed maintenance is older than 30 minutes.
- Keeps stale reminder scans as the highest-priority attention reason.
- Exposes a bounded reason code and the fixed freshness threshold in the existing operational view.
- Shows the reason in Turkish without exposing internal errors or free-form worker output.
- Does not start maintenance, retry work, create notifications, or delete data.

No database migration is required after v0.44. The health summary uses the existing reminder-run and maintenance-run tables.

Validation completed with TypeScript checks, 50 tests, and API/web production builds.
