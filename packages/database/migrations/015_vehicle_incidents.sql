CREATE TABLE vehicle_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), vehicle_id uuid NOT NULL REFERENCES vehicles(id), driver_id uuid REFERENCES drivers(id),
  incident_type text NOT NULL CHECK (incident_type IN ('accident','damage','theft','breakdown','other')), severity text NOT NULL CHECK (severity IN ('minor','major','critical')),
  occurred_at timestamptz NOT NULL, location text CHECK (location IS NULL OR char_length(location)<=240), description text NOT NULL CHECK (char_length(description) BETWEEN 5 AND 2000),
  injury_reported boolean NOT NULL DEFAULT false, police_report_number text, insurance_claim_number text, estimated_cost numeric(14,2) CHECK (estimated_cost>=0), actual_cost numeric(14,2) CHECK (actual_cost>=0),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','closed')), resolution_notes text, resolved_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (NOT injury_reported OR incident_type='accident')
);
CREATE INDEX vehicle_incidents_tenant_status_idx ON vehicle_incidents(tenant_id,status,occurred_at DESC);
CREATE INDEX vehicle_incidents_tenant_vehicle_idx ON vehicle_incidents(tenant_id,vehicle_id,occurred_at DESC);
ALTER TABLE vehicle_incidents ENABLE ROW LEVEL SECURITY; ALTER TABLE vehicle_incidents FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_incidents_tenant_isolation ON vehicle_incidents USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON vehicle_incidents TO filo_app;
