# Local Update v0.99 — Evidence-backed Production Launch Gate

## Scope

- Exact-version automatic launch assessment
- Active physical-pilot approval requirement
- Health-gated 100 percent rollout completion requirement
- Zero active release incident requirement
- Six fixed legal and operational evidence gates
- Owner-only GO or NO-GO decision
- Immutable decision and evidence snapshot
- Tenant-isolated web control center and audit trail

## Database

Apply `054_launch_readiness_gate.sql` with the deployment migration runner. It creates
forced-RLS review and evidence tables, a single-draft partial index and database triggers
that prevent any decided review or attached evidence from being rewritten. Do not apply
the migration with the application role.

## Decision sequence

Open one review for the exact mobile version. Complete the physical pilot production
approval and the guarded 10→25→50→100 rollout, then resolve every release incident.
Attach bounded evidence notes for privacy/legal approval, restore rehearsal, continuous
worker operation, monitoring/alerts, support/on-call coverage and rollback rehearsal.

GO is accepted only when all three live automatic checks and all six evidence records pass.
NO-GO may be recorded earlier to preserve the blocker and corrective plan. Both decisions
store the complete readiness snapshot and become immutable.

## Production boundary

This release provides the technical decision gate; it does not fabricate legal approval,
restore results, device pilot evidence or operational staffing. Those artifacts must be
produced and reviewed by their accountable owners before GO. A v0.99 physical-device pilot
and explicit owner approval remain required before v1.0 launch.
