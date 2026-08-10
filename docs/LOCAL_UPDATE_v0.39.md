# Local Update v0.39

This release adds tenant-scoped operational visibility for archive-reconciliation overdue-reminder scans. The notification retention screen now shows the latest twenty scans, including their source, initiating user, scanned work count, created in-app notification count, and execution time.

The history is read-only and remains limited to owner, admin, and operator roles through the existing retention endpoint. It does not start reconciliation, retry archive attempts, send email or push notifications, close work, or delete data.

Run:

```text
npm install
npm run typecheck
npm test
npm run build
```

No database migration is required. v0.39 reads the tenant-isolated reminder ledger introduced by `038_notification_archive_reconciliation_operations.sql`.
