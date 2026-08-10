# Local update v0.49

This release hardens repository and release-package hygiene for the v1.0 release-candidate path.

- The release gate rejects tracked dependency folders, build output, coverage, real environment files, ZIP archives, and TypeScript build caches.
- The current update manifest must be sorted, unique, path-safe, free of forbidden artifacts, and reference files that exist.
- Explicit deletion targets are recorded separately and must be absent before the release gate can pass.
- Five policy tests protect the hygiene and manifest rules.
- `apps/web/tsconfig.tsbuildinfo` is removed from source control and ignored going forward.
- No database schema or product behavior is changed.

No database migration is required after v0.48.

Before uploading the update files, delete `apps/web/tsconfig.tsbuildinfo` from GitHub. Then run `npm ci` and `npm run release:verify`.
