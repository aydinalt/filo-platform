CREATE TABLE location_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  recorded_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  accuracy_meters double precision NOT NULL CHECK (accuracy_meters > 0 AND accuracy_meters <= 5000),
  speed_mps double precision CHECK (speed_mps IS NULL OR speed_mps BETWEEN 0 AND 150),
  heading_degrees double precision CHECK (heading_degrees IS NULL OR heading_degrees >= 0 AND heading_degrees < 360),
  UNIQUE (tenant_id, event_id)
);

CREATE INDEX location_events_assignment_time_idx
  ON location_events(assignment_id, recorded_at DESC);

ALTER TABLE location_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE location_events FORCE ROW LEVEL SECURITY;
CREATE POLICY location_events_tenant_isolation ON location_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON location_events TO filo_app;
GRANT USAGE, SELECT ON SEQUENCE location_events_id_seq TO filo_app;
