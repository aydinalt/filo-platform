# Local update v0.91

This release delivers account recovery and session security as one connected launch pack.

- Adds generic, rate-limited password recovery requests without account disclosure.
- Adds tenant-bound, single-use password reset capabilities with a 30-minute expiry.
- Sends recovery mail through the existing leased production notification worker.
- Treats recovery email as transactional while preserving bounce/complaint suppression.
- Redacts recovery links after delivery, completion, cancellation, inactivity or expiry.
- Revokes every active session after password reset.
- Adds authenticated password change while preserving only the current session.
- Adds self-service active session listing and non-current session revocation.
- Adds account security web screens and audit evidence.
- Adds one migration and no file deletion.

Upload the files listed in `release-v0.91/update-files.txt`.
