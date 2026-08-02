# Local Update v0.19

## Scope

- Per-user email and push preferences
- Quiet hours and timezone configuration
- Provider-independent notification delivery outbox
- Idempotent enqueue, retry scheduling and terminal delivery state
- Tenant RLS, role enforcement and audit records

External email and push providers are intentionally out of scope. The outbox is the stable integration boundary for a later provider worker.

## Apply

```bash
npm install
npm run db:migrate
npm run typecheck
npm test
npm run build
```
