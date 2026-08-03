# Local Update v0.24

This release adds tenant-scoped notification delivery analytics for authorized operational roles. It reports delivery status, channel/provider breakdowns, provider feedback, active suppressions, average delivery time, and oldest ready queue age over a bounded 1–90 day window.

Apply `packages/database/migrations/024_notification_analytics.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```
