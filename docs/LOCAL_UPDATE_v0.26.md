# Local Update v0.26

This release adds tenant-scoped notification provider incidents. Authorized operational roles can sync current provider health warnings into deduplicated incidents, acknowledge or resolve them, and inspect their immutable event history.

Apply `packages/database/migrations/026_notification_provider_incidents.sql`, then run:

```text
npm install
npm run typecheck
npm test
npm run build
```
