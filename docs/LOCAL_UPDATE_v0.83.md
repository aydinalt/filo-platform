# Local update v0.83

This release keeps notification preference changes consistent with already queued deliveries.

- Serializes concurrent updates to one tenant-user preference record.
- Cancels pending and failed deliveries for a channel as soon as that channel is disabled.
- Leaves active processing leases untouched so an in-flight provider call is not corrupted.
- Defers eligible queued deliveries when newly saved quiet hours are currently active.
- Calculates the new quiet-hour deadline in the recipient's IANA time zone and never moves an existing deadline backward.
- Rechecks current channel preferences at worker claim time before selecting provider work.
- Prevents an operator retry from reactivating a delivery whose channel is disabled.
- Records the previous and next preference snapshots plus cancelled and deferred queue counts in the same transaction.
- Adds no migration, environment variable or provider credential.

Upload the files listed in `release-v0.83/update-files.txt`.
