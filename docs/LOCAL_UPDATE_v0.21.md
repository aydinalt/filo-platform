# Filo Platform v0.21 local update

This release adds tenant-scoped notification templates, locale/channel variants, declared-variable validation, safe rendering, preview APIs, fallback content snapshots and worker-ready rendered payloads.

Apply `packages/database/migrations/021_notification_templates.sql`, then run:

```bash
npm install
npm run typecheck
npm test
npm run build
```
