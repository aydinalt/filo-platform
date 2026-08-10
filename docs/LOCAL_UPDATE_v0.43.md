# Local update v0.43

This release makes interrupted reminder-run maintenance idempotent and exposes its completed run history to operational users.

- Persists one completed maintenance result per tenant and `maintenanceKey`.
- Returns the stored result when the worker repeats an already completed key.
- Keeps the tenant advisory lock and active owner, admin, or operator actor validation.
- Records only the bounded `REMINDER_MAINTENANCE_COMPLETED` outcome code.
- Shows the latest 20 completed maintenance runs in the notification retention screen.
- Does not retry reminder scans, create notifications, or delete data.

Apply `packages/database/migrations/040_notification_archive_reconciliation_reminder_maintenance_runs.sql` after the v0.40 lifecycle migration.

Validation completed with TypeScript checks, 48 tests, and API/web production builds.
