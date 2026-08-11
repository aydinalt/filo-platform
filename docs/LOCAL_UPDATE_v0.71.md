# Local update v0.71

This release makes provider webhook delivery state transitions deterministic under delayed or concurrent callbacks.

- Locks the recorded delivery only after callback signature verification.
- Preserves the monotonic terminal order: complained, bounced, then delivered.
- Records valid out-of-order events without allowing them to downgrade delivery state.
- Preserves the earliest authentic provider delivery timestamp.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.71/update-files.txt`.
