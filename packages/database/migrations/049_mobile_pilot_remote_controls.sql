ALTER TABLE mobile_access_credentials
  ADD COLUMN pilot_tracking_allowed boolean NOT NULL DEFAULT true,
  ADD COLUMN pilot_control_reason text
    CHECK (pilot_control_reason IS NULL OR char_length(pilot_control_reason) BETWEEN 3 AND 240),
  ADD COLUMN pilot_control_updated_at timestamptz;

CREATE TABLE mobile_pilot_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  tracking_enabled boolean NOT NULL DEFAULT true,
  minimum_app_version text CHECK (
    minimum_app_version IS NULL OR minimum_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
  ),
  heartbeat_interval_seconds integer NOT NULL DEFAULT 60
    CHECK (heartbeat_interval_seconds BETWEEN 30 AND 300),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mobile_device_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES mobile_access_credentials(id) ON DELETE CASCADE,
  command_type text NOT NULL CHECK (command_type IN ('pause_tracking', 'resume_tracking', 'sync_now')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'acknowledged', 'failed', 'cancelled')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 240),
  result_code text CHECK (result_code IS NULL OR char_length(result_code) BETWEEN 1 AND 80),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  CHECK (
    (status = 'pending' AND acknowledged_at IS NULL)
    OR (status <> 'pending')
  )
);

CREATE UNIQUE INDEX mobile_device_commands_pending_unique
  ON mobile_device_commands(tenant_id, credential_id, command_type)
  WHERE status = 'pending';
CREATE INDEX mobile_device_commands_device_created_idx
  ON mobile_device_commands(tenant_id, credential_id, created_at DESC);

ALTER TABLE mobile_pilot_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_pilot_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE mobile_device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_device_commands FORCE ROW LEVEL SECURITY;

CREATE POLICY mobile_pilot_policies_tenant_isolation ON mobile_pilot_policies
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mobile_device_commands_tenant_isolation ON mobile_device_commands
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON mobile_pilot_policies, mobile_device_commands FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON mobile_pilot_policies, mobile_device_commands TO filo_app;
