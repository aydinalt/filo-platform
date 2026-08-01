CREATE TABLE driver_safety_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id),
  event_type text NOT NULL CHECK (event_type IN ('speeding','harsh_braking','harsh_acceleration','long_idle','manual')),
  severity text NOT NULL CHECK (severity IN ('low','medium','high','critical')),
  occurred_at timestamptz NOT NULL,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  value numeric(12,2),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved')),
  reviewed_at timestamptz,
  resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (occurred_at <= now() + interval '5 minutes'),
  CHECK ((latitude IS NULL) = (longitude IS NULL))
);
CREATE INDEX driver_safety_events_tenant_time_idx ON driver_safety_events(tenant_id,occurred_at DESC);
CREATE INDEX driver_safety_events_assignment_idx ON driver_safety_events(tenant_id,assignment_id,status);
ALTER TABLE driver_safety_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_safety_events FORCE ROW LEVEL SECURITY;
CREATE POLICY driver_safety_events_tenant_isolation ON driver_safety_events
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON driver_safety_events TO filo_app;
