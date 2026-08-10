# Local update v0.46

This release adds defense-in-depth tenant scoping to reconciliation reminder maintenance operations and visibility.

- Every maintenance idempotency lookup now includes the authenticated tenant identifier.
- Interrupted reminder-run updates now include an explicit tenant predicate in addition to PostgreSQL RLS.
- Reminder-run history, maintenance history, and health counts now include explicit tenant predicates.
- Initiating-user names are resolved only through a matching tenant membership and an active user record.
- A security regression test protects the explicit tenant predicates and tenant-safe identity joins.
- Existing transaction-scoped RLS context, worker authentication, operational-role checks, advisory locks, and audit records remain in force.
- No maintenance action, automatic retry, notification, physical deletion, or free-form error storage is added.

No database migration is required after v0.45. The release hardens the application queries that use the existing reminder-run and maintenance-run tables.

Validation completed with TypeScript checks, 51 tests, and API/web production builds.
