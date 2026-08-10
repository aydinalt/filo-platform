# Local update v0.55

This release adds safe production request correlation and bounded logging.

- Generates a globally unique server-side identifier for every API request.
- Returns the identifier in `x-request-id` so support reports can be correlated with logs.
- Ignores client-supplied request identifiers to prevent log correlation spoofing.
- Redacts authorization, session cookie, webhook signature and response cookie headers.
- Logs only bounded error type and safe error code metadata, never error messages or stacks.
- Validates `LOG_LEVEL` against the supported production levels.
- Adds configuration, unit and release-smoke regression coverage.
- Does not add a SQL migration or change fleet workflows.

No SQL migration is required after v0.54. Upload the files listed in
`release-v0.55/update-files.txt`; the Render log level is included in `render.yaml`.
