# Local Update v0.94 — Mobile Pilot Remote Safety Controls

## Scope

- Tenant-wide mobile tracking emergency stop
- Minimum mobile application version enforcement
- Configurable 30–300 second heartbeat interval
- Persistent per-device pilot pause and explicit resume
- Remote pause, resume and queue-sync commands
- Mobile command acknowledgement with bounded result evidence
- Server-side shift and location ingestion enforcement
- Tenant RLS and audit evidence for every control transition

## Database

Apply `049_mobile_pilot_remote_controls.sql` with the deployment migration runner.
The migration adds forced-RLS pilot policy and command tables plus persistent device
pilot control fields. Never run it with the application role.

## Pilot verification

Follow steps 13–18 in `docs/PRODUCTION_RUNBOOK.md` on one physical iPhone and at
least two Android/OEM devices. A command is not considered successful merely because
it was queued; retain the device acknowledgement and server enforcement result.

## Rollback behavior

Application rollback does not remove migration 049. Before rolling back the API or
mobile app, set `trackingEnabled=false` and keep mobile ingestion closed until a
compatible build is restored.

## Build-tool advisory

API, worker and web production dependencies audit clean. Expo/Metro's mobile build
toolchain currently reports upstream `image-size` and `uuid` advisories; npm's proposed
automatic fix downgrades React Native/Expo across breaking major versions and was not
applied. Re-evaluate when the compatible Expo line publishes patched transitive versions.
