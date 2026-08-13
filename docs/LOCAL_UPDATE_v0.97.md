# Local Update v0.97 — Staged Mobile Release Rollout

## Scope

- Owner-only rollout plan linked to an active physical-pilot production approval
- Stable device grouping at 10, 25, 50 and 100 percent
- Exact target-version heartbeat observation for selected devices
- Bounded unhealthy-device threshold before every stage expansion
- Sequential advance, pause, resume, completion and rollback transitions
- Forced-RLS rollout state and append-only decision evidence
- Tenant audit history and operational device eligibility panel

## Database

Apply `052_mobile_release_rollouts.sql` with the deployment migration runner. The migration
adds tenant-isolated rollout and event tables. The application role can update rollout state
but has no update or delete grant on the append-only event evidence.

## Activation order

First complete the v0.97 physical-device cohort and owner production approval. Create the
rollout with v0.96 as the previous stable version, start at 10 percent and wait for every
selected device to report a v0.97 heartbeat within the health threshold. Advance only in the enforced
10→25→50→100 sequence.

## Health gate

The server recomputes membership and health during each transition. Missing target-version
heartbeats or an unhealthy rate above the plan threshold returns a conflict and leaves the
stage unchanged. Device assignment is stable as the stage grows, including for small fleets.

## Rollback behavior

Pause first when investigation is still in progress. Rollback closes the rollout and records
the previous stable version plus the observed health snapshot. Migration 052, rollout events,
pilot runs and the production approval remain in place as immutable operational evidence.
