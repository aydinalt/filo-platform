CREATE TABLE mobile_pilot_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  credential_id uuid NOT NULL REFERENCES mobile_access_credentials(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'passed', 'failed', 'cancelled')),
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  started_by uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_by uuid REFERENCES users(id),
  completed_at timestamptz,
  CHECK (
    (status = 'running' AND completed_by IS NULL AND completed_at IS NULL)
    OR (status <> 'running' AND completed_by IS NOT NULL AND completed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX mobile_pilot_runs_one_active_device
  ON mobile_pilot_runs(tenant_id, credential_id)
  WHERE status = 'running';
CREATE INDEX mobile_pilot_runs_tenant_started_idx
  ON mobile_pilot_runs(tenant_id, started_at DESC);

CREATE TABLE mobile_pilot_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_id uuid NOT NULL REFERENCES mobile_pilot_runs(id) ON DELETE CASCADE,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'permission_always', 'heartbeat_online', 'background_location',
    'offline_queue', 'queue_recovered', 'remote_control'
  )),
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  observation_count integer NOT NULL DEFAULT 1 CHECK (observation_count > 0),
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object'),
  UNIQUE (run_id, evidence_type)
);

CREATE INDEX mobile_pilot_evidence_run_idx
  ON mobile_pilot_evidence(tenant_id, run_id, evidence_type);

ALTER TABLE mobile_pilot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_pilot_runs FORCE ROW LEVEL SECURITY;
ALTER TABLE mobile_pilot_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_pilot_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY mobile_pilot_runs_tenant_isolation ON mobile_pilot_runs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mobile_pilot_evidence_tenant_isolation ON mobile_pilot_evidence
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON mobile_pilot_runs, mobile_pilot_evidence FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON mobile_pilot_runs, mobile_pilot_evidence TO filo_app;

COMMENT ON TABLE mobile_pilot_runs IS
  'Physical-device pilot qualification runs; only evidence-complete runs can pass.';
COMMENT ON TABLE mobile_pilot_evidence IS
  'Server-observed, deduplicated evidence collected from authenticated mobile runtime activity.';
