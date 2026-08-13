# Local Update v0.95 — Physical Device Pilot Evidence

## Scope

- One active qualification run per tenant-scoped mobile credential
- Six server-observed release-gate evidence categories
- Automatic evidence capture from heartbeat, background location, offline queue recovery and command acknowledgement
- Owner/admin pass decision blocked until every required category exists
- Audited pass, fail and cancellation decisions
- Downloadable UTF-8 CSV pilot evidence summary
- Web panel progress, missing-evidence and decision controls

## Database

Apply `050_mobile_pilot_evidence.sql` with the deployment migration runner. The
migration adds forced-RLS pilot run and deduplicated evidence tables. Never run it
with the application role.

## Physical pilot procedure

Start a run from `Telefon Takibi > Saha cihaz sağlığı`, then execute production
runbook steps 19–24 on one physical iPhone and at least two Android/OEM models.
Evidence is collected only after the run starts. A screenshot or manual statement
does not replace missing authenticated runtime evidence.

## Decision rule

Only owner/admin users can record a pass, fail or cancellation. `passed` is rejected
with `PILOT_EVIDENCE_INCOMPLETE` while any required evidence is missing. Failure and
cancellation remain available so an unsafe or interrupted test can be closed without
manufacturing a successful result.

## Rollback behavior

Application rollback does not remove migration 050 or previously collected proof.
Before rolling back, close running pilots as cancelled and keep tenant-wide mobile
tracking paused until a compatible API and web build is restored.
