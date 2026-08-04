# Local Update v0.28

This release adds deduplicated in-app notifications for notification-provider incidents. New incidents, critical escalations, and confirmed recovery candidates notify owner, admin, and operator memberships. Each notification carries a typed provider-incident UUID target instead of an arbitrary URL, and the UI marks the notification as read before focusing the related incident. Provider-incident notifications remain in-app only and are excluded from the email/push delivery outbox in this release.

Apply `packages/database/migrations/028_notification_incident_actions.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```
