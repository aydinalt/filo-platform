# Local update v0.60

This release adds bounded retention for dormant server-side session records.

- Keeps expired and revoked session records for 30 days by default.
- Prunes only records belonging to the tenant completing a successful login.
- Deletes at most 200 eligible records per successful login by default.
- Never includes active sessions in cleanup.
- Validates configurable retention and batch limits at API startup.
- Adds migration `042_user_session_retention.sql` for the cleanup lookup index.

Deployment applies one SQL migration after v0.59. Existing active sessions and
user-facing fleet workflows are unchanged. Upload the files listed in
`release-v0.60/update-files.txt`.
