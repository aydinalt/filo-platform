# Local Update v0.37

This release adds explicit handling deadlines and overdue visibility to archive-reconciliation results. A positive reconciliation must be acknowledged within one hour and resolved within twenty-four hours. The API exposes only the deadline that applies to the current lifecycle state and marks it overdue when that deadline has passed.

Zero-result reconciliations remain `not_required` and have no deadline. Resolved records retain their original timestamps for audit evidence but are never reported as overdue. Open and acknowledged work is ordered ahead of closed history in the operations view.

This release does not retry archive attempts, close work automatically, send escalation notifications, or physically delete notification data.

Run:

```text
npm install
npm run typecheck
npm test
npm run build
```

Apply `037_notification_archive_reconciliation_deadlines.sql` after the v0.36 migration. It backfills positive history with deterministic deadlines, enforces deadline-state consistency, and adds an operational lookup index.
