# Filo Platform v0.23 local update

This release adds tenant-scoped notification suppressions. Hard bounces and complaints automatically suppress the recipient/channel, administrators can add or lift manual suppressions, and the delivery worker cancels queued suppressed deliveries before provider handoff.

Apply `packages/database/migrations/023_notification_suppressions.sql`, then run:

```bash
npm install
npm run typecheck
npm test
npm run build
```
