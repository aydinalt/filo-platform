# Local update v0.77

This release completes a focused notification delivery worker reliability pack.

- Requires an active owner, admin or operator membership for claim and completion calls.
- Validates completion delivery IDs before opening a tenant database transaction.
- Reconciles expired processing leases into auditable failed attempts with bounded exponential retry delay.
- Cancels exhausted expired leases after ten attempts instead of leaving them permanently processing or reclaiming them again.
- Adds explicit tenant predicates to actor, suppression, claim, lease lock, completion update and attempt lifecycle queries.
- Stores the first successful provider message ID on the delivery and rejects conflicting completion identities.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.77/update-files.txt`.
