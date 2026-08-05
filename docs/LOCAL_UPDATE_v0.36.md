# Local Update v0.36

This release adds an auditable handling lifecycle for archive-reconciliation results. Reconciliations that found stale attempts become `open`; zero-result runs remain `not_required`. Owners and admins can move an actionable result to `acknowledged` and then `resolved`, while operators retain read-only operational visibility.

Resolving a reconciliation requires a bounded resolution note. Every transition is tenant-scoped, transactionally locked, and written to the audit log. A resolved result cannot be reopened. The lifecycle does not automatically retry an archive attempt and does not physically delete notifications.

Run:

```text
npm install
npm run typecheck
npm test
npm run build
```

Apply `036_notification_archive_reconciliation_handling.sql` after the v0.35 migration. The migration backfills positive historical reconciliations as open, leaves zero-result history as not required, enforces lifecycle invariants, and adds a partial operational index.
