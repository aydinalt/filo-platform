# Local update v0.42

This release adds a controlled worker maintenance operation for interrupted reconciliation reminder scans.

- Adds `POST /notification-retention-worker/reconcile-interrupted-reminder-runs`.
- Requires the existing worker authentication and an active owner, admin, or operator actor.
- Closes only reminder runs left in `running` state for more than 15 minutes.
- Stores only the bounded `REMINDER_SCAN_INTERRUPTED` outcome code.
- Uses a tenant-scoped advisory lock and writes per-run plus maintenance-summary audit events.
- Returns the reconciled count without retrying work, deleting data, or creating notifications.
- Reuses the existing `039` lifecycle migration; no new migration is required.

Validation completed with TypeScript checks, 47 tests, and API/web production builds.
