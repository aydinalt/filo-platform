# Local update v0.92

This release delivers the native driver background-location foundation as one connected pilot pack.

- Adds an Expo iOS/Android driver application.
- Adds 15-minute, single-use assignment enrollment capabilities.
- Stores only SHA-256 digests for enrollment and mobile access secrets.
- Rotates the earlier assignment credential when a new phone claims enrollment.
- Adds 90-day, revocable, assignment-bound mobile access.
- Adds driver-controlled shift start/end and always-permission tracking state.
- Adds a bounded offline queue and chronological batches of at most 100 location points.
- Reuses idempotent event identities plus the existing geofence and speeding pipeline.
- Adds web enrollment creation, one-time code display, history and revocation.
- Adds one migration and no file deletion.

The API and worker production dependency audit is clean. The full monorepo audit still
reports upstream Expo/Metro build-tool advisories in `image-size` and `uuid`; they are not
loaded by the production API or worker and have no non-breaking upstream resolution in
the selected Expo 57 line. Mobile builds must use trusted repository assets only, and the
advisories must be rechecked before public store release.

Set `EXPO_PUBLIC_API_URL` for mobile builds, apply
`047_mobile_background_tracking.sql`, and upload the files listed in
`release-v0.92/update-files.txt`.
