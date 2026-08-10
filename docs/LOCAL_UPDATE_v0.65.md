# Local update v0.65

This release corrects the retry guidance returned by the persistent login throttle.

- Calculates `Retry-After` only from IP or account buckets that are actually limiting login.
- Keeps the longer wait when both buckets are limiting.
- Prevents a non-limiting fresh bucket from extending a user's reported lockout.
- Keeps rate-limit budgets, account verification and database schema unchanged.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.65/update-files.txt`.
