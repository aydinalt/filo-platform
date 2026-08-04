# Local Update v0.25

This release adds tenant-scoped notification provider health monitoring. Authorized operational roles can inspect provider failure rates, queue delay, last successful delivery, and inactive-provider warnings over a bounded lookback window. Owners and admins can persist tenant-specific warning thresholds.

Apply `packages/database/migrations/025_notification_provider_health.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```
