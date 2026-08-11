# Local update v0.82

This release makes notification recipient preferences and quiet-hour scheduling safe across missing settings and time zones.

- Uses default enabled email and push channels when a recipient has no stored preference row.
- Keeps an explicit tenant condition on candidate, template and duplicate-delivery lookups.
- Validates new IANA time-zone names before opening the preference database transaction.
- Falls back to `Europe/Istanbul` for legacy preference rows whose time zone is no longer valid.
- Rejects equal quiet-hour start and end values instead of creating an ambiguous full-day window.
- Evaluates quiet hours in the recipient's local time rather than the API server's local time.
- Handles daytime and overnight quiet windows, including the correct current-day or next-day end.
- Converts the local quiet-hour end back to an absolute timestamp with PostgreSQL time-zone rules for DST safety.
- Adds no migration, environment variable or provider credential.

Upload the files listed in `release-v0.82/update-files.txt`.
