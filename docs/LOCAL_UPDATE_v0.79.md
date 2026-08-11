# Local update v0.79

This release adds durable notification delivery attempt receipts and safe completion replay handling.

- Records the attempt number, bounded worker ID, one-way lease digest and pinned provider profile for every completed worker attempt without retaining the raw lease token.
- Records the same worker and provider context when an expired lease is reconciled into a retry or terminal cancellation.
- Accepts an identical completion replay after a successful database commit, allowing workers to recover from a lost HTTP response.
- Rejects replayed completions whose outcome, provider message ID or bounded error code conflicts with the stored receipt.
- Prevents more than one attempt receipt from being stored for the same tenant, delivery and lease token.
- Keeps historical attempt rows compatible by adding nullable audit columns.
- Adds one additive SQL migration and no environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.79/update-files.txt`.
