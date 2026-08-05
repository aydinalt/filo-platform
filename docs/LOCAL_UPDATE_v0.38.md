# Local Update v0.38

This bundled release turns archive-reconciliation results into assignable operational work. Owner and admin users can assign active records to an eligible owner, admin, or operator; taking or resolving an unassigned record assigns it to the acting user. The operations view now exposes active, open, acknowledged, overdue, unassigned, and resolved totals together with focused filters.

Overdue reminder scans are available to owner/admin users and to the authenticated retention worker. A scan creates at most one actionless in-app reminder per recipient and lifecycle stage. An assigned record notifies its eligible assignee; an unassigned record notifies active owners and admins. Reminder notifications remain excluded from email and push delivery. Scans never retry archive attempts, close work, or delete data.

The release also corrects notification-worker actor validation. Archive, reconciliation, reminder, and provider-incident jobs now validate an active tenant membership with an operational role instead of querying a tenant column that does not exist on `users`.

Run:

```text
npm install
npm run typecheck
npm test
npm run build
```

Apply `038_notification_archive_reconciliation_operations.sql` after the v0.37 migration. It adds assignment and reminder evidence to reconciliation records, creates an idempotent reminder-run ledger, enables tenant RLS, and adds operational indexes.
