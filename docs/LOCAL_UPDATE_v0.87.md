# Local update v0.87

This release bounds notification provider administration identities and list scope.

- Validates provider profile route identifiers as UUIDs before database work.
- Returns a bounded `400` response for malformed provider update routes.
- Prevents malformed UUID input from surfacing as a PostgreSQL cast error.
- Adds an explicit tenant predicate to provider list reads in addition to forced RLS.
- Keeps provider creation, activation, rotation and pinned delivery behavior unchanged.
- Adds contract coverage for accepted and rejected provider profile identities.
- Adds no migration, environment variable, credential value or deletion.

Upload the files listed in `release-v0.87/update-files.txt`.
