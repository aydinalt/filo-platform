# Local update v0.72

This release protects provider event idempotency from conflicting callback identities.

- Treats a callback as a duplicate only when its core recorded identity matches.
- Rejects reuse of a provider event id across different deliveries or event details.
- Preserves the existing provider event and delivery state when a conflict occurs.
- Returns a stable conflict response instead of silently discarding the callback.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.72/update-files.txt`.
