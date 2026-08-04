# Local Update v0.31

This release adds an auditable execution lifecycle for notification-retention archiving. Manual, scheduled, and retry attempts are recorded separately from successful archive batches. Each attempt ends as succeeded, skipped, or failed and exposes only a bounded outcome code instead of raw infrastructure errors.

Owner and admin roles can retry a failed attempt from the notification operations screen. Retries are explicit, tenant-scoped, auditable, and limited to three generations. Operators can inspect attempt history but cannot trigger a retry. Scheduler failures return a retryable service response after the failed attempt has been safely recorded.

Apply `packages/database/migrations/031_notification_archive_attempts.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```

No notification is physically deleted. Existing retention eligibility, batch limits, tenant advisory locking, idempotent scheduler keys, and open provider-incident protection remain in effect.
