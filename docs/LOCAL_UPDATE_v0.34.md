# Local Update v0.34

This release adds an explicit owner/admin action for reconciling stale notification archive attempts without waiting for the scheduler. The action is tenant-scoped, requires a fixed confirmation value, generates a minute-bucketed idempotency key on the server, and uses the existing archive advisory lock. Repeated submissions by the same operator in the same minute are treated as the same request.

Manual reconciliation uses the tenant's configured stale-heartbeat threshold. It only marks expired `running` attempts as failed with the safe `ATTEMPT_HEARTBEAT_EXPIRED` outcome, records the reconciliation and audit event, and refreshes the operational history. It does not physically delete notifications and does not start an automatic retry.

Run:

```text
npm install
npm run typecheck
npm test
npm run build
```

No database migration is required after v0.33. The new authenticated endpoint is `POST /api/notifications/retention/reconcile`; it is limited to owner/admin roles and requires `{ "confirmation": "RECONCILE_STALE_ATTEMPTS" }`.
