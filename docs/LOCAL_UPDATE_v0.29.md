# Local Update v0.29

This release adds notification inbox lifecycle controls. Users can mark all of their visible active notifications as read. Owner and admin roles can set a tenant retention window between 30 and 730 days, while owner, admin, and operator roles can run a controlled archive pass. The archive is logical rather than destructive: eligible read notifications remain in the database with actor, timestamp, and archive-run identifiers. Notifications for unresolved provider incidents are excluded from archiving, and archived notifications cannot enter a new delivery outbox batch.

Apply `packages/database/migrations/029_notification_retention.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```
