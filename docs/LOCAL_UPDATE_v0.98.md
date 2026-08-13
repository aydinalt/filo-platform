# Local Update v0.98 — Automated Rollout Guard and Release Incidents

## Scope

- Scheduled rollout health evaluation through the authenticated worker boundary
- Idempotent tenant/run guard ledger and transaction advisory lock
- Manual, automatic-pause and automatic-rollback guard modes
- Bounded two-to-five consecutive breach rollback threshold
- First-breach automatic pause and repeated-breach automatic rollback
- Aggregated warning/critical release incidents
- Owner acknowledgement and evidence-backed resolution
- Web panel guard status, counters and incident operations

## Database

Apply `053_mobile_release_guard.sql` with the deployment migration runner. It extends rollout
state, permits bounded automatic event types and adds forced-RLS incident and guard-run tables.
Do not apply it with the application role.

## Worker

The existing scheduler calls `/api/internal/mobile-release-guard/run` for every tenant scope.
Each minute-bucket key can be committed once. Keep the worker continuously available and use
the same production worker credential already required by notification maintenance.

## Incident lifecycle

Repeated health violations update one active incident per rollout. The first automatic breach
pauses an active rollout. In `auto_rollback` mode, guard-paused rollouts continue evaluation;
the configured consecutive threshold closes the rollout as rolled back and marks the incident
critical. Only an owner can acknowledge or resolve an active incident.

## Recovery and rollback

A recovered health gate resets consecutive breaches and records recovery, but does not resume
the rollout. Review and resolve the incident, then use the owner rollout transition if rollout
continuation is appropriate. Automatic rollback preserves all pilot, approval, event and
incident evidence.
