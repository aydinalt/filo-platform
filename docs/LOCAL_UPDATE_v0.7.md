# Local Update v0.7

v0.7 adds tenant-isolated circular geofences and server-generated entry/exit events.

## Included

- Create, list, and deactivate geofences
- Radius and coordinate validation
- Entry/exit transition detection during accepted location writes
- Deduplicated per-assignment geofence state
- Tenant RLS, role checks, audit records, and operations UI
- `007_geofences.sql` migration

External map rendering, polygon geofences, notifications, and route optimization remain outside this release.
