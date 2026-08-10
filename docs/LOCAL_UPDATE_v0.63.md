# Local update v0.63

This release prevents a verified login from deleting concurrent account throttle attempts.

- Returns a precision-preserving internal snapshot with each persistent account-bucket update.
- Clears the verified account bucket only when its attempt count and window start are unchanged.
- Preserves a bucket when another API instance records an attempt during authentication.
- Keeps the client-IP bucket intact.
- Keeps session creation and the conditional account reset in one tenant transaction.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.63/update-files.txt`.
