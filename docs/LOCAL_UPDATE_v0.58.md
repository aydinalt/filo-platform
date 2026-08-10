# Local update v0.58

This release adds a centralized cross-site request forgery boundary for browser mutations.

- Requires the `x-filo-csrf: 1` header on browser-facing state-changing API requests.
- Rejects an explicitly foreign `Origin` even when the custom header is present.
- Updates the web client to attach the header to every `POST`, `PUT`, `PATCH` and `DELETE` call.
- Keeps safe read methods unchanged.
- Exempts signed provider webhooks and key-authenticated internal workers from browser-only checks.
- Adds release smoke coverage for missing headers, foreign origins and trusted mutations.
- Does not add a SQL migration or change fleet workflows.

No SQL migration is required after v0.57. Upload the files listed in
`release-v0.58/update-files.txt`.
