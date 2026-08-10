# Local update v0.64

This release fixes the persistent login throttle query used by every login attempt.

- Returns `window_started_at` from the PostgreSQL upsert before the outer query reads it.
- Preserves the timestamp as text so concurrent-attempt comparisons keep PostgreSQL precision.
- Adds a regression assertion for the complete SQL result contract.
- Keeps IP and account throttling behavior unchanged.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.64/update-files.txt`.
