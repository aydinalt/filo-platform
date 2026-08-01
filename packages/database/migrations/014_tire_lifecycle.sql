CREATE TABLE tire_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), brand text NOT NULL CHECK (char_length(brand) BETWEEN 2 AND 80),
  model text NOT NULL CHECK (char_length(model) BETWEEN 1 AND 80), size text NOT NULL CHECK (char_length(size) BETWEEN 3 AND 40), serial_number text,
  purchased_on date, initial_odometer_km integer CHECK (initial_odometer_km IS NULL OR initial_odometer_km BETWEEN 0 AND 10000000),
  target_life_km integer CHECK (target_life_km IS NULL OR target_life_km BETWEEN 1000 AND 500000), target_change_date date,
  notes text CHECK (notes IS NULL OR char_length(notes)<=1000), status text NOT NULL DEFAULT 'stored' CHECK (status IN ('stored','mounted','retired')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (purchased_on IS NULL OR target_change_date IS NULL OR target_change_date>=purchased_on)
);
CREATE TABLE tire_mounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), tire_set_id uuid NOT NULL REFERENCES tire_sets(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id), position text NOT NULL CHECK (position IN ('front','rear','all')), mounted_on date NOT NULL,
  mounted_odometer_km integer NOT NULL CHECK (mounted_odometer_km BETWEEN 0 AND 10000000), removed_on date,
  removed_odometer_km integer CHECK (removed_odometer_km IS NULL OR removed_odometer_km BETWEEN 0 AND 10000000),
  removal_reason text CHECK (removal_reason IS NULL OR char_length(removal_reason) BETWEEN 2 AND 500), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (removed_on IS NULL OR removed_on>=mounted_on), CHECK (removed_odometer_km IS NULL OR removed_odometer_km>=mounted_odometer_km)
);
CREATE UNIQUE INDEX tire_sets_tenant_serial_unique ON tire_sets(tenant_id,serial_number) WHERE serial_number IS NOT NULL;
CREATE UNIQUE INDEX tire_mounts_active_set_unique ON tire_mounts(tire_set_id) WHERE removed_on IS NULL;
CREATE INDEX tire_sets_tenant_status_idx ON tire_sets(tenant_id,status); CREATE INDEX tire_mounts_tenant_vehicle_idx ON tire_mounts(tenant_id,vehicle_id,mounted_on DESC);
ALTER TABLE tire_sets ENABLE ROW LEVEL SECURITY; ALTER TABLE tire_sets FORCE ROW LEVEL SECURITY;
ALTER TABLE tire_mounts ENABLE ROW LEVEL SECURITY; ALTER TABLE tire_mounts FORCE ROW LEVEL SECURITY;
CREATE POLICY tire_sets_tenant_isolation ON tire_sets USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY tire_mounts_tenant_isolation ON tire_mounts USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON tire_sets TO filo_app; GRANT SELECT,INSERT,UPDATE ON tire_mounts TO filo_app;
