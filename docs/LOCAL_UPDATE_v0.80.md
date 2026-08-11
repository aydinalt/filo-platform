# Local update v0.80

This release adds bounded notification delivery lease renewal for long-running provider dispatches.

- Adds an authenticated worker endpoint that renews an in-flight delivery lease without rotating its token.
- Binds renewal to the same tenant, delivery, worker ID and live lease token that were established at claim time.
- Requires the requesting actor to retain an active owner, admin or operator membership before renewal.
- Extends a live lease toward five minutes from the current request while never shortening its existing deadline.
- Caps the complete claim lifecycle at fifteen minutes from the original lock time so a worker cannot hold a delivery indefinitely.
- Rejects expired, completed, mismatched or deadline-exhausted leases without changing delivery state.
- Returns the renewed lease deadline as a canonical ISO timestamp.
- Adds no migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.80/update-files.txt`.
