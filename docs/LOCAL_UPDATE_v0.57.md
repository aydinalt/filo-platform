# Local update v0.57

This release makes authorization revocation effective on the next protected request.

- Revalidates the signed session user and tenant membership against PostgreSQL.
- Rejects disabled users and removed tenant memberships with the existing safe session error.
- Reloads the current membership role instead of trusting a stale role claim.
- Refreshes tenant and user display fields from the active database records.
- Keeps database failures distinct from invalid sessions so operational faults remain observable.
- Adds regression coverage for role refresh and revoked membership handling.
- Does not add a SQL migration or change fleet workflows.

No SQL migration is required after v0.56. Upload the files listed in
`release-v0.57/update-files.txt`.
