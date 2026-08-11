# Local update v0.75

This release rejects obviously invalid provider webhook signature envelopes before tenant database work begins.

- Validates the timestamp and signature header shape before opening a tenant transaction.
- Rejects missing, malformed and stale signature envelopes without querying provider profiles.
- Keeps the secret-backed HMAC comparison inside the tenant transaction.
- Returns the existing bounded `INVALID_WEBHOOK_SIGNATURE` response.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.75/update-files.txt`.
