# Local Update v1.0 — Certified Production Activation

## Scope

- Owner-only production activation from an exact ready GO review
- Fresh live-gate validation at activation and resume
- Explicit activation and resume confirmation phrases
- Immutable JSON launch certificate and PostgreSQL SHA-256 digest
- One active production version per tenant
- Emergency owner suspension without a readiness prerequisite
- Controlled resume after current safety gates pass
- Append-only production lifecycle events and tenant audit evidence
- Web production state, certificate download and emergency controls

## Database

Apply `055_production_launch_activation.sql` with the deployment migration runner. It adds
forced-RLS production launch and event tables, active/version uniqueness, a database GO
enforcement trigger and immutable certificate protection. Do not apply the migration with
the application role.

## Activation sequence

Complete a physical-device pilot for `1.0.0`, approve the exact version, complete its guarded
10→25→50→100 rollout, resolve all release incidents, complete the six launch evidence gates
and record an owner GO decision. Enter `ACTIVATE_PRODUCTION` in the web control center and
record the accountable activation note.

The API locks the tenant and GO review, then rechecks the current pilot approval, rollout and
incident state. A stale or invalid GO record cannot activate production. On success, download
the certificate JSON and retain its SHA-256 value with the deployment record.

## Emergency lifecycle

Owner can suspend production immediately with a reason. Resume requires
`RESUME_PRODUCTION`, no competing active version, and another live-gate evaluation. The
certificate never changes; suspension and resume are additional events.

## Important boundary

Installing this source release does not mean production is automatically live. Physical
device evidence, real legal/operational approvals, infrastructure restore proof and the
explicit owner GO/activation actions must still be completed in the target environment.
