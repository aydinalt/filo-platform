# Local Update v0.27

This release adds idempotent scheduled notification-provider health scans and a controlled recovery workflow. Scheduler retries are deduplicated by scan key, overlapping scans are locked per tenant, and an incident becomes a recovery candidate only after the configured number of consecutive healthy scans. Incidents are never resolved automatically.

Apply `packages/database/migrations/027_notification_provider_incident_scans.sql`, configure the external scheduler to call `POST /api/internal/notification-health-scans/run` with the notification worker credential, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```
