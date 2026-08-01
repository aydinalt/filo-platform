CREATE TABLE vehicle_inspections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id), inspection_type text NOT NULL CHECK (inspection_type IN ('pre_shift','post_shift')),
  odometer_km integer CHECK (odometer_km IS NULL OR odometer_km BETWEEN 0 AND 10000000), safe_to_operate boolean NOT NULL,
  notes text CHECK (notes IS NULL OR char_length(notes)<=1000), inspected_at timestamptz NOT NULL DEFAULT now(), created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE inspection_defects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), inspection_id uuid NOT NULL REFERENCES vehicle_inspections(id),
  item text NOT NULL CHECK (char_length(item) BETWEEN 2 AND 120), severity text NOT NULL CHECK (severity IN ('minor','major','critical')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 2 AND 500), status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewed','resolved')),
  resolution_notes text CHECK (resolution_notes IS NULL OR char_length(resolution_notes)<=1000), reviewed_at timestamptz, resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), CHECK (status<>'resolved' OR resolution_notes IS NOT NULL)
);
CREATE INDEX vehicle_inspections_tenant_time_idx ON vehicle_inspections(tenant_id,inspected_at DESC);
CREATE INDEX inspection_defects_tenant_status_idx ON inspection_defects(tenant_id,status,severity);
ALTER TABLE vehicle_inspections ENABLE ROW LEVEL SECURITY; ALTER TABLE vehicle_inspections FORCE ROW LEVEL SECURITY;
ALTER TABLE inspection_defects ENABLE ROW LEVEL SECURITY; ALTER TABLE inspection_defects FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_inspections_tenant_isolation ON vehicle_inspections USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY inspection_defects_tenant_isolation ON inspection_defects USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT ON vehicle_inspections TO filo_app; GRANT SELECT,INSERT,UPDATE ON inspection_defects TO filo_app;
