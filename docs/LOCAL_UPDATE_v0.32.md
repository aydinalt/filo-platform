# Local Update v0.32

This release reconciles notification-retention archive attempts that remain in the running state after an interrupted process. Each attempt records a heartbeat. A worker-triggered reconciliation can mark only attempts whose heartbeat exceeded a bounded stale window.

Reconciliation is tenant-scoped, protected by the same PostgreSQL advisory lock used by archive execution, and idempotent through a unique reconciliation key. It cannot close an archive transaction that still owns the tenant lock. Reconciled attempts receive the safe `ATTEMPT_HEARTBEAT_EXPIRED` outcome code and remain eligible for the existing owner/admin controlled retry flow.

Apply `packages/database/migrations/032_notification_archive_attempt_reconciliation.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```

The internal endpoint `POST /api/internal/notification-retention/reconcile-attempts` requires the existing notification worker credential. Its request includes tenant and actor UUIDs, an idempotent reconciliation key, and a stale threshold from 5 to 1440 minutes. No notification is physically deleted and no retry is started automatically.
