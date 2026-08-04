# Local Update v0.30

This release adds controlled automatic archiving for read in-app notifications. Automation is disabled by default and can be enabled per tenant. Owner and admin roles can configure the retention period, schedule interval, and batch size. Scheduler requests use the existing notification worker credential, a tenant-scoped actor, and an idempotent `runKey`.

Each run obtains a tenant advisory lock and archives at most the configured batch size with `FOR UPDATE SKIP LOCKED`. Duplicate, disabled, not-due, concurrent, and invalid-actor runs are skipped safely. Open provider incidents remain protected. All records are logically archived rather than deleted, and every run remains tenant-scoped and auditable.

Apply `packages/database/migrations/030_notification_retention_automation.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```

The scheduler calls `POST /api/internal/notification-retention/run` with `x-worker-key` and:

```json
{
  "tenantId": "tenant UUID",
  "actorUserId": "tenant scheduler actor UUID",
  "runKey": "scheduler:2026-08-04T16:00"
}
```
