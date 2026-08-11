# Local update v0.74

This release validates provider webhook route identities before tenant database work begins.

- Requires the callback tenant identifier to be a UUID.
- Applies the registered provider slug format to the callback route.
- Rejects malformed route identities before opening a tenant transaction or querying RLS data.
- Returns the existing bounded `INVALID_PROVIDER_CALLBACK` response for invalid routes.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.74/update-files.txt`.
