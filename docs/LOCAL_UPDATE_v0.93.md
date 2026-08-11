# Local update v0.93

This release turns native background tracking into an observable physical-device pilot.

- Adds authenticated, schema-bounded mobile health heartbeats.
- Captures app/OS version, battery, low-power mode, network and permission state.
- Captures tracking state, bounded error code, queue depth and oldest queued point.
- Records successful sync and latest accepted location timestamps.
- Classifies never-seen, offline, permission, runtime and delayed-queue conditions server-side.
- Adds a tenant-scoped field-device health dashboard to the web panel.
- Retries the offline queue automatically when connectivity returns and every minute while active.
- Removes acknowledged event identities without overwriting location points collected during an in-flight sync.
- Adds one migration and no file deletion.

Apply `048_mobile_pilot_telemetry.sql`, rebuild the mobile application, and upload the
files listed in `release-v0.93/update-files.txt`. Physical iOS and Android/OEM pilot tests
remain mandatory before any uninterrupted-tracking claim.

The production API and worker audit is clean. The monorepo audit continues to report
upstream Expo/Metro build-tool advisories inherited from the selected Expo 57 line. The
available automated fix downgrades to incompatible Expo/React Native versions, so it is
not applied. Mobile builds must accept only trusted repository assets and these advisories
must be rechecked before public store release.
