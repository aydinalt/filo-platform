CREATE INDEX location_events_tenant_time_idx
  ON location_events(tenant_id, recorded_at DESC);

COMMENT ON INDEX location_events_tenant_time_idx IS
  'Supports tenant-scoped shift route history and operational timeline queries.';
