# Local Update v0.15

v0.15 adds tenant-isolated accident, damage and insurance claim tracking with review and resolution workflows.

1. Back up the database.
2. Install dependencies with `npm install`.
3. Run `npm run db:migrate` to apply `015_vehicle_incidents.sql`.
4. Run `npm run typecheck`, `npm test` and `npm run build`.
5. Restart the API and web applications.

No environment variable changes are required.
