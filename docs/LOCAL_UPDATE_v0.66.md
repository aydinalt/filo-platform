# Local update v0.66

This release prevents an already limited source IP from consuming account login budgets.

- Stops account-attempt increments after the IP bucket has already limited the request.
- Reads the existing account bucket without mutating it so a longer active lock remains reportable.
- Prevents one blocked source IP from extending lockouts across targeted accounts.
- Keeps account protection active whenever the IP bucket still permits credential processing.
- Keeps rate-limit thresholds, database schema and user-facing fleet workflows unchanged.
- Adds no SQL migration or environment variable.

Upload the files listed in `release-v0.66/update-files.txt`.
