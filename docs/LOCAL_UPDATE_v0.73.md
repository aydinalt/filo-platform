# Local update v0.73

This release constrains signed provider event times to the recorded delivery lifecycle.

- Accepts up to five minutes of clock skew around delivery creation and callback receipt.
- Rejects events claiming to predate the delivery beyond that tolerance.
- Rejects events claiming to occur too far in the future.
- Prevents invalid event times from changing delivery state, delivery time or analytics.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.73/update-files.txt`.
