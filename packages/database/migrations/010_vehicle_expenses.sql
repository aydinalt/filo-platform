CREATE TABLE vehicle_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  category text NOT NULL CHECK (category IN ('fuel','toll','parking','wash','repair','other')),
  occurred_on date NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  odometer_km integer CHECK (odometer_km >= 0),
  liters numeric(10,3) CHECK (liters > 0),
  description text CHECK (char_length(description) <= 500),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((category='fuel' AND liters IS NOT NULL) OR (category<>'fuel' AND liters IS NULL))
);
CREATE INDEX vehicle_expenses_tenant_date_idx ON vehicle_expenses(tenant_id,occurred_on DESC);
CREATE INDEX vehicle_expenses_vehicle_odometer_idx ON vehicle_expenses(tenant_id,vehicle_id,odometer_km DESC) WHERE odometer_km IS NOT NULL;
ALTER TABLE vehicle_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_expenses FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_expenses_tenant_isolation ON vehicle_expenses
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT ON vehicle_expenses TO filo_app;
