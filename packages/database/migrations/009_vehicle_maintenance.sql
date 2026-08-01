CREATE TABLE vehicle_maintenance_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id), vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  title text NOT NULL CHECK (char_length(title) BETWEEN 2 AND 120),
  due_date date, due_odometer_km integer CHECK (due_odometer_km > 0),
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed','cancelled')),
  notes text CHECK (char_length(notes) <= 1000), created_by uuid NOT NULL REFERENCES users(id),
  completed_at timestamptz, completed_by uuid REFERENCES users(id), completed_odometer_km integer CHECK (completed_odometer_km >= 0),
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (due_date IS NOT NULL OR due_odometer_km IS NOT NULL)
);
CREATE INDEX maintenance_tenant_status_due_idx ON vehicle_maintenance_plans(tenant_id,status,due_date);
CREATE UNIQUE INDEX maintenance_active_vehicle_title_idx ON vehicle_maintenance_plans(tenant_id,vehicle_id,lower(title)) WHERE status='scheduled';
ALTER TABLE vehicle_maintenance_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_maintenance_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY maintenance_tenant_isolation ON vehicle_maintenance_plans
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON vehicle_maintenance_plans TO filo_app;
