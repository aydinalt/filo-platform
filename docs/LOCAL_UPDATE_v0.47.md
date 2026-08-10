# Local update v0.47

This release adds the API release-smoke gate and hardens public error responses before the v1.0 release candidate.

- The smoke suite verifies the unauthenticated health endpoint and production security headers.
- Protected operational views are verified to reject requests without a session.
- Internal retention maintenance is verified to reject missing worker credentials before business logic runs.
- Malformed JSON is returned as a safe `400 INVALID_REQUEST` response instead of being converted to an internal server error.
- Unknown routes return a stable `404 NOT_FOUND` response without echoing the requested path.
- Other client-side HTTP failures are mapped to bounded error codes while unexpected failures remain `500 INTERNAL_ERROR`.
- No raw parser message, stack trace, automatic retry, notification, deletion, or database change is added.

No database migration is required after v0.46. This release changes only API boundary handling, automated smoke coverage, release metadata, and documentation.

Validation completed with TypeScript checks, 56 automated tests, API/web production builds, and release package integrity checks.
