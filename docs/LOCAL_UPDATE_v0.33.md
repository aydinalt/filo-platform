# Local Update v0.33

This release schedules the safe reconciliation introduced in v0.32 and exposes its operational state. Reconciliation automation is disabled by default and can be configured per tenant with a bounded interval and stale-heartbeat threshold.

Worker calls remain tenant-scoped, use the existing notification-worker credential, share the archive advisory lock, and are idempotent through `reconciliationKey`. A due run records its source, reconciled count, last run, and next due time. Disabled, early, duplicate, or lock-conflicted calls do not mark active work as failed.

Apply `packages/database/migrations/033_notification_archive_reconciliation_schedule.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```

The internal endpoint remains `POST /api/internal/notification-retention/reconcile-attempts`. Its request contains tenant and actor UUIDs plus an idempotent reconciliation key. The stale threshold now comes from owner/admin-controlled tenant settings instead of worker input. No notification is physically deleted and no retry is started automatically.
