CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE CHECK (email = lower(email)),
  full_name text NOT NULL,
  password_hash text NOT NULL,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TYPE membership_role AS ENUM ('owner', 'admin', 'operator', 'viewer');
CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role membership_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_id)
);

CREATE TYPE vehicle_status AS ENUM ('active', 'maintenance', 'inactive');
CREATE TABLE vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plate text NOT NULL,
  make text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL CHECK (year BETWEEN 1980 AND 2100),
  status vehicle_status NOT NULL DEFAULT 'active',
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, plate)
);

CREATE TABLE audit_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX vehicles_tenant_status_idx ON vehicles(tenant_id, status);
CREATE INDEX audit_events_tenant_created_idx ON audit_events(tenant_id, created_at DESC);

ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_events FORCE ROW LEVEL SECURITY;

CREATE POLICY vehicles_tenant_isolation ON vehicles
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

CREATE POLICY audit_tenant_isolation ON audit_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON vehicles, audit_events FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO filo_app;
GRANT SELECT ON tenants, users, memberships TO filo_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles TO filo_app;
GRANT SELECT, INSERT ON audit_events TO filo_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO filo_app;
