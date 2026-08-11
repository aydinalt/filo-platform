# Local update v0.84

This release makes notification provider rotation deterministic while preserving
in-flight and retry delivery identity.

- Serializes provider creation and activation per tenant/channel.
- Verifies the target profile inside the same transaction before displacing the active profile.
- Keeps every provider mutation explicitly tenant scoped in addition to PostgreSQL RLS.
- Records rotation and ordinary status changes in the tenant audit history.
- Preserves the provider profile and credential reference already pinned to a delivery.
- Sends newly unassigned deliveries through the newly active provider only.
- Adds focused rotation tests and strengthens the worker retry regression test.
- Adds no migration, environment variable, credential value or deletion.

Upload the files listed in `release-v0.84/update-files.txt`.
