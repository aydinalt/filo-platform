# Local Update v0.35

This release adds tenant-scoped in-app notifications for stale archive-attempt reconciliation results. A manual or scheduled reconciliation creates one deduplicated warning for each current owner, admin, and operator only when at least one expired `running` attempt was marked failed. A zero-result reconciliation remains silent.

The warning uses the reconciliation UUID as its source, has no action target or free-form URL, and is created in the same tenant transaction as the reconciliation result. If the reconciliation rolls back, its warnings roll back as well. Users whose role is later changed to viewer can no longer list or mark these operational warnings as read.

Reconciliation warnings are deliberately excluded from the email and push delivery outbox. They do not start an automatic retry and do not physically delete notifications.

Run:

```text
npm install
npm run typecheck
npm test
npm run build
```

Apply `035_notification_archive_reconciliation_notifications.sql` after the v0.33 migration. The migration adds the `archive_reconciliation` inbox source, enforces its actionless and deduplicated shape, records the number of warnings created, and adds a targeted lookup index.
