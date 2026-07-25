CREATE TYPE shift_status AS ENUM ('active', 'completed');
CREATE TYPE location_permission AS ENUM
  ('unknown', 'granted_while_in_use', 'granted_always', 'denied', 'restricted');
CREATE TYPE tracking_state AS ENUM
  ('off', 'ready', 'tracking', 'paused', 'permission_revoked', 'error');

CREATE TABLE vehicle_driver_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  driver_id uuid NOT NULL REFERENCES drivers(id),
  device_id uuid REFERENCES devices(id) ON DELETE SET NULL,
  starts_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ended_at IS NULL OR ended_at >= starts_at)
);

CREATE UNIQUE INDEX one_active_assignment_per_vehicle
  ON vehicle_driver_assignments(vehicle_id) WHERE ended_at IS NULL;
CREATE UNIQUE INDEX one_active_assignment_per_driver
  ON vehicle_driver_assignments(driver_id) WHERE ended_at IS NULL;

CREATE TABLE work_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  status shift_status NOT NULL DEFAULT 'active',
  started_by uuid NOT NULL REFERENCES users(id),
  ended_by uuid REFERENCES users(id),
  CHECK ((status = 'active' AND ended_at IS NULL) OR (status = 'completed' AND ended_at IS NOT NULL))
);
CREATE UNIQUE INDEX one_active_shift_per_assignment
  ON work_shifts(assignment_id) WHERE status = 'active';

CREATE TABLE tracking_statuses (
  assignment_id uuid PRIMARY KEY REFERENCES vehicle_driver_assignments(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  permission location_permission NOT NULL DEFAULT 'unknown',
  state tracking_state NOT NULL DEFAULT 'off',
  error_code text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid NOT NULL REFERENCES users(id),
  CHECK (state <> 'tracking' OR permission IN ('granted_while_in_use', 'granted_always'))
);

ALTER TABLE vehicle_driver_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_driver_assignments FORCE ROW LEVEL SECURITY;
ALTER TABLE work_shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_shifts FORCE ROW LEVEL SECURITY;
ALTER TABLE tracking_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_statuses FORCE ROW LEVEL SECURITY;

CREATE POLICY assignments_tenant_isolation ON vehicle_driver_assignments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY shifts_tenant_isolation ON work_shifts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY tracking_tenant_isolation ON tracking_statuses
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON vehicle_driver_assignments, work_shifts, tracking_statuses TO filo_app;
