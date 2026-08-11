# Local update v0.85

This release makes notification provider status transitions concurrency-safe and
idempotent.

- Rereads and row-locks the provider after taking the tenant/channel advisory lock.
- Uses the locked current status as the source of truth for transition audit evidence.
- Treats a repeated request for the already-current status as a successful no-op.
- Prevents no-op requests from creating duplicate audit events or changing timestamps.
- Keeps active rotation, pinned delivery identity and tenant isolation unchanged.
- Adds focused tests for replay and deactivation behavior.
- Adds no migration, environment variable, credential value or deletion.

Upload the files listed in `release-v0.85/update-files.txt`.
