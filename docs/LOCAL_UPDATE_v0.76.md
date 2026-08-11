# Local update v0.76

This release completes a focused provider webhook production hardening pack.

- Accepts only canonical ten-digit Unix-second signature timestamps.
- Uses the original request acceptance time for signature and event-time validation.
- Adds explicit tenant predicates to provider profile, delivery lock and delivery update queries.
- Rejects callbacks whose provider message ID conflicts with the delivery's recorded identity.
- Initializes a missing provider message ID once and never overwrites an existing value.
- Returns `503 PROVIDER_WEBHOOK_UNAVAILABLE` with a bounded `Retry-After` when a configured provider secret is missing or too short.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.76/update-files.txt`.
