# Local update v0.48

This release adds the automated verification gate for the v1.0 release-candidate path.

- `npm run release:verify` checks root/API/lockfile version alignment, migration filename safety, TypeScript, all automated tests, and API/web production builds.
- GitHub Actions runs the same gate for every push and pull request targeting `main` with Node.js 22 and locked dependencies.
- Workflow permissions are read-only, overlapping runs on the same ref are cancelled, and execution is bounded to fifteen minutes.
- No database schema, product behavior, automatic retry, notification, or data deletion is added.

No database migration is required after v0.47.

Run `npm ci` and then `npm run release:verify` locally to execute the same release gate used by GitHub.
