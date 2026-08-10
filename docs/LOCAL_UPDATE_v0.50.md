# Local update v0.50

This release removes three stale root-file copies from the contracts source directory and protects the v1.0 release-candidate repository layout.

- Removes a duplicate root README from `packages/contracts/src`.
- Removes a stale nested lockfile that still described the old `0.5.0` release.
- Removes the redundant source-level `package.json`; the contracts workspace package already declares ESM at its root.
- Adds exact-path release-policy protection so these accidental copies cannot be committed or packaged again.
- Adds a regression test while preserving legitimate workspace package metadata.
- Does not change product behavior or the database schema.

No database migration is required after v0.49.

Delete the three paths listed in `release-v0.50/deleted-files.txt`, upload the update files, then run `npm ci` and `npm run release:verify`.
