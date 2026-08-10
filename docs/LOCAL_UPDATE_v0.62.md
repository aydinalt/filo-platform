# Local update v0.62

This release prevents verified users from consuming their own persistent account login budget.

- Clears only the normalized account bucket after credentials are verified.
- Keeps the client-IP bucket intact so a valid account cannot reset source throttling.
- Clears the account bucket in the same transaction that creates the active session.
- Rolls back both operations if session creation or bucket clearing fails.
- Keeps invalid credentials, disabled users and rate-limited requests unchanged.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.62/update-files.txt`.
