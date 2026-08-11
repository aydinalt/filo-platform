# Local update v0.88

This release bounds notification provider incident identities and tenant scope.

- Validates provider incident route identifiers as UUIDs before database work.
- Returns a bounded `400` response for malformed incident update routes.
- Adds explicit tenant predicates to incident list and lifecycle update queries.
- Tenant-scopes joined provider profiles, incident event history and related notifications.
- Preserves forced RLS as the final database isolation boundary.
- Keeps provider incident scan and lifecycle behavior unchanged.
- Adds no migration, environment variable, credential value or deletion.

Upload the files listed in `release-v0.88/update-files.txt`.
