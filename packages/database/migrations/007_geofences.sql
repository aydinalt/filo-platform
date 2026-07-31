CREATE TABLE geofences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  radius_meters integer NOT NULL CHECK (radius_meters BETWEEN 50 AND 50000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX geofences_tenant_name_active_idx
  ON geofences(tenant_id, lower(name)) WHERE status = 'active';

CREATE TABLE geofence_assignment_states (
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  geofence_id uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id) ON DELETE CASCADE,
  is_inside boolean NOT NULL,
  last_location_event_id bigint NOT NULL REFERENCES location_events(id),
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (geofence_id, assignment_id)
);

CREATE TABLE geofence_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  geofence_id uuid NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id) ON DELETE CASCADE,
  location_event_id bigint NOT NULL REFERENCES location_events(id),
  event_type text NOT NULL CHECK (event_type IN ('entered','exited')),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (geofence_id, assignment_id, location_event_id)
);

CREATE INDEX geofence_events_tenant_time_idx ON geofence_events(tenant_id, occurred_at DESC);

ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences FORCE ROW LEVEL SECURITY;
ALTER TABLE geofence_assignment_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_assignment_states FORCE ROW LEVEL SECURITY;
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events FORCE ROW LEVEL SECURITY;

CREATE POLICY geofences_tenant_isolation ON geofences
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY geofence_states_tenant_isolation ON geofence_assignment_states
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
CREATE POLICY geofence_events_tenant_isolation ON geofence_events
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

GRANT SELECT, INSERT, UPDATE ON geofences, geofence_assignment_states TO filo_app;
GRANT SELECT, INSERT ON geofence_events TO filo_app;
GRANT USAGE, SELECT ON SEQUENCE geofence_events_id_seq TO filo_app;
