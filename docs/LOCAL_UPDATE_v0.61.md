# Local update v0.61

This release makes login brute-force protection consistent across API instances.

- Keeps the existing fast per-process login throttle.
- Adds shared PostgreSQL buckets for both client IP and normalized account email.
- Stores only secret-keyed SHA-256 digests, never raw IP or email values.
- Updates bucket counters atomically so concurrent API instances share one limit.
- Prunes at most 100 expired buckets during an attempt and excludes the active bucket.
- Returns the existing safe `429 RATE_LIMITED` response with `Retry-After`.
- Adds migration `043_auth_login_rate_limits.sql`.

Deployment applies one SQL migration after v0.60. No new environment variable or
user-facing fleet workflow is introduced. Upload the files listed in
`release-v0.61/update-files.txt`.
