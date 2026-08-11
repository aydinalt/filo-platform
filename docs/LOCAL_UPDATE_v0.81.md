# Local update v0.81

This release prevents operator delivery overrides from bypassing the notification worker lifecycle.

- Replaces manual delivered/failed status writes with explicit retry or cancel operations.
- Requires a bounded uppercase reason code and the `APPLY_DELIVERY_ACTION` confirmation literal.
- Allows retry only for failed deliveries below the ten-attempt ceiling.
- Allows cancellation only for pending or failed deliveries and never mutates an active processing lease.
- Keeps the attempt counter unchanged during an operator retry so only a real worker claim consumes an attempt.
- Clears defensive stale lease fields when an eligible queued delivery is retried or cancelled.
- Writes the actor, operation, reason, previous status and next status to the tenant audit trail atomically.
- Validates the delivery route identity as a UUID before database work.
- Adds no migration, environment variable or provider credential.

Upload the files listed in `release-v0.81/update-files.txt`.
