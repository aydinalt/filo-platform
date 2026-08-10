# Local update v0.59

This release makes browser logout revoke the current session on the server.

- Creates one tenant-scoped active-session record for every successful login.
- Binds the signed cookie token to a unique session identifier, issuer and audience.
- Revalidates session expiry and revocation state on every protected API request.
- Revokes only the current session during logout, leaving other devices signed in.
- Prevents a copied session cookie from being reused after logout.
- Preserves immediate user, membership and role revalidation.
- Adds migration `041_user_sessions.sql` with forced tenant RLS.

Deployment applies one SQL migration after v0.58. Existing v0.58 cookies do not have
a server-side session record and users must sign in again once after deployment.
Upload the files listed in `release-v0.59/update-files.txt`.
