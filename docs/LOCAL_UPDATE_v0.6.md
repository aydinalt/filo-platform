# Local Update v0.6

v0.6 adds tenant-isolated shift route history and server-calculated trip summaries.

## Included

- Time-ordered location history for each work shift
- Distance estimate with accuracy and impossible-jump filtering
- Moving and stopped duration estimates
- Operations-panel route timeline
- `006_route_history.sql` query index

Run `npm install`, `npm run db:migrate`, `npm run typecheck`, and `npm test` after applying the update.

Map rendering, navigation, geofencing, and route optimization remain outside this release.
