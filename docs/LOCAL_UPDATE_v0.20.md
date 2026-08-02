# Local Update v0.20

## Scope

- Lease-based notification delivery worker
- Concurrent-safe claiming with `SKIP LOCKED`
- Worker credential boundary and dry-run provider adapter
- Delivery attempts, bounded retry backoff and terminal cancellation
- Tenant-scoped queue metrics and audit-ready attempt history

Real email and push provider credentials remain out of scope. Configure `NOTIFICATION_WORKER_KEY` with at least 32 random characters before enabling a worker.

## Apply

```bash
npm install
npm run db:migrate
npm run typecheck
npm test
npm run build
```
