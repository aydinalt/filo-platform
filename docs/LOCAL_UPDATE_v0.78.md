# Local update v0.78

This release completes a focused notification provider dispatch integrity pack.

- Pins every delivery to the provider profile selected on its first claim so retries cannot silently switch provider identity.
- Returns the exact provider profile ID and credential environment-variable reference to the external worker without exposing credential values.
- Cancels queued deliveries for disabled users or recipients who no longer belong to the tenant before provider dispatch.
- Requires completion calls to present the same bounded worker ID that owns the active lease.
- Requires a provider message ID for successful completions and a bounded non-secret error code for failed completions.
- Rejects ambiguous failed results that include a provider message ID and successful results that include an error.
- Adds no SQL migration, environment variable or user-facing fleet workflow.

Upload the files listed in `release-v0.78/update-files.txt`.
