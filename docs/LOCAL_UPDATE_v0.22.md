# Filo Platform v0.22 local update

This release adds tenant-scoped email/push provider profiles, environment-variable credential references, one active provider per channel, worker provider resolution and HMAC-SHA256 signed, idempotent delivery webhooks.

Apply `packages/database/migrations/022_notification_providers.sql`, configure the referenced environment variables, then run:

```bash
npm install
npm run typecheck
npm test
npm run build
```
