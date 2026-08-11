# Local update v0.86

This release makes notification provider creation auditable and conflict-safe.

- Uses the tenant/channel advisory lock for the complete provider creation transition.
- Captures the provider profile displaced by creation of a new active profile.
- Records creation and active rotation as separate audit evidence in the same transaction.
- Avoids emitting a rotation event when an inactive provider profile is created.
- Returns bounded `409` errors for duplicate provider names and active-channel conflicts.
- Reloads the created profile with an explicit tenant predicate in addition to RLS.
- Keeps pinned delivery identity, provider credentials and existing status behavior unchanged.
- Adds focused tests for active creation, inactive creation and conflict classification.
- Adds no migration, environment variable, credential value or deletion.

Upload the files listed in `release-v0.86/update-files.txt`.
