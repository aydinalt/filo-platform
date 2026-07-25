CREATE TYPE driver_status AS ENUM ('active', 'inactive');
CREATE TABLE drivers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  full_name text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 120),
  phone text NOT NULL,
  license_number text,
  status driver_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, phone)
);

CREATE TYPE device_ownership AS ENUM ('company', 'personal');
CREATE TYPE device_platform AS ENUM ('android', 'ios');
CREATE TYPE device_status AS ENUM ('active', 'inactive');
CREATE TABLE devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  ownership device_ownership NOT NULL,
  platform device_platform NOT NULL,
  model text NOT NULL,
  identifier text,
  driver_id uuid REFERENCES drivers(id) ON DELETE SET NULL,
  status device_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ownership = 'company' OR identifier IS NULL),
  UNIQUE (tenant_id, identifier)
);

CREATE INDEX drivers_tenant_status_idx ON drivers(tenant_id, status);
CREATE INDEX devices_tenant_driver_idx ON devices(tenant_id, driver_id);

ALTER TABLE drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers FORCE ROW LEVEL SECURITY;
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE devices FORCE ROW LEVEL SECURITY;

CREATE POLICY drivers_tenant_isolation ON drivers
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY devices_tenant_isolation ON devices
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON drivers, devices TO filo_app;
