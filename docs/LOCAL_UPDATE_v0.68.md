# Local update v0.68

This release patches vulnerable transitive production dependencies.

- Updates `fast-uri` to patched 3.x and 4.x releases.
- Updates `nanoid` to its patched 3.x release.
- Adds an offline regression test that prevents vulnerable versions from returning.
- Keeps application behavior, database schema and environment variables unchanged.
- Adds no SQL migration or user-facing fleet workflow.

Upload the files listed in `release-v0.68/update-files.txt`.
