# Local update v0.56

This release hardens the authentication boundary against brute-force and timing attacks.

- Adds a dedicated per-client-IP rate limit to the login endpoint.
- Returns the existing safe `RATE_LIMITED` response after excessive attempts.
- Sends a bounded `Retry-After` header without exposing account details.
- Uses a valid fallback scrypt hash for unknown accounts to reduce timing differences.
- Validates the login attempt count and time window at startup.
- Adds configuration, password-security and release-smoke regression coverage.
- Does not add a SQL migration or change fleet workflows.

No SQL migration is required after v0.55. Upload the files listed in
`release-v0.56/update-files.txt`; the Render limits are included in `render.yaml`.
