# Local Update v0.96 — Multi-device Pilot Cohort and Production Approval

## Scope

- Automatic mobile manufacturer and model collection during enrollment
- Pilot pass pinned to application version and device identity at decision time
- Target-version cohort requiring one passed iPhone and two passed Android devices
- Two distinct Android manufacturer/model fingerprints required
- Owner-only production approval and revocation
- Database-protected immutable readiness snapshot
- Tenant audit evidence and downloadable approval CSV
- Web panel matrix, missing requirements and release status

## Database

Apply `051_mobile_pilot_cohort_release.sql` with the deployment migration runner.
The migration extends mobile credentials and pilot runs, adds a forced-RLS approval
table, and upgrades the security-definer mobile functions. Never run it with the
application role.

## Compatibility

The six-argument enrollment function remains available for rollback compatibility;
older clients receive `unknown` metadata and cannot qualify for a v0.96 production
cohort. The authentication function returns additional columns while preserving all
previous output names. Existing v0.95 passed pilots are not silently promoted because
they lack a decision-time version/device snapshot.

## Production approval

Run a fresh 6/6 v0.96 pilot on one physical iPhone and two different Android/OEM
models. The owner can approve only after the server-computed matrix is complete.
The approval snapshot is protected by a database trigger; revocation changes only
status and bounded revocation evidence. Re-approval requires a new approval record.

## Rollback behavior

Application rollback does not remove migration 051 or approval history. Revoke the
active v0.96 approval and pause tenant mobile tracking before restoring an older API
or mobile build.
