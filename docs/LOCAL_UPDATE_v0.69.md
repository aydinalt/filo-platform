# Local update v0.69

This release verifies notification provider webhook signatures against the exact request body.

- Preserves the original JSON request body within the existing API body-size limit.
- Verifies provider HMAC signatures before using the parsed webhook event.
- Prevents valid whitespace or formatting differences from breaking webhook authentication.
- Keeps normal JSON validation and prototype-poisoning protections unchanged.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.69/update-files.txt`.
