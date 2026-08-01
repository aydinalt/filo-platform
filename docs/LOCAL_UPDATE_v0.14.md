# Local Update v0.14

v0.14 adds tenant-isolated tire inventory, mounting history, and date/odometer lifecycle status.

1. Pull or copy the updated files.
2. Run `npm install`.
3. Run `npm run db:migrate` to apply `014_tire_lifecycle.sql`.
4. Run `npm run typecheck`, `npm test`, and `npm run build`.

Only stored tire sets can be mounted. Removal dates and odometer values cannot precede mounting values. Every change is written to the audit trail.
