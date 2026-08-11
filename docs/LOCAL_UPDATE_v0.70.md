# Local update v0.70

This release binds each provider webhook callback to the provider profile recorded on its delivery.

- Resolves the callback profile through the tenant-scoped delivery identifier.
- Prevents the same provider name on multiple channels from selecting the wrong secret.
- Keeps callbacks valid for deliveries sent before a provider profile rotation.
- Prevents a callback from updating a delivery recorded against another provider profile.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.70/update-files.txt`.
