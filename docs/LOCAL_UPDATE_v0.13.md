# Local Update v0.13

v0.13 adds tenant-isolated pre/post-shift vehicle inspections and defect resolution.

1. Pull or copy the updated files.
2. Run `npm install`.
3. Run `npm run db:migrate` to apply `013_vehicle_inspections.sql`.
4. Run `npm run typecheck`, `npm test`, and `npm run build`.

Unsafe inspections require at least one defect. Critical defects cannot be marked safe to operate, and an unsafe inspection moves the vehicle to maintenance status.
