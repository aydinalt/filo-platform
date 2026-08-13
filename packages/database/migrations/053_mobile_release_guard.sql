ALTER TABLE mobile_release_rollouts
  ADD COLUMN guard_mode text NOT NULL DEFAULT 'auto_pause'
    CHECK (guard_mode IN ('manual', 'auto_pause', 'auto_rollback')),
  ADD COLUMN rollback_after_breaches integer NOT NULL DEFAULT 3
    CHECK (rollback_after_breaches BETWEEN 2 AND 5),
  ADD COLUMN consecutive_breaches integer NOT NULL DEFAULT 0
    CHECK (consecutive_breaches >= 0),
  ADD COLUMN last_guard_at timestamptz,
  ADD COLUMN guard_paused_at timestamptz;

ALTER TABLE mobile_release_rollout_events
  DROP CONSTRAINT mobile_release_rollout_events_action_check,
  ADD CONSTRAINT mobile_release_rollout_events_action_check CHECK (
    action IN (
      'created', 'started', 'advanced', 'paused', 'resumed', 'completed', 'rolled_back',
      'guard_recovered', 'auto_paused', 'auto_rolled_back'
    )
  );

CREATE TABLE mobile_release_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rollout_id uuid NOT NULL,
  target_version text NOT NULL CHECK (target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  severity text NOT NULL DEFAULT 'warning' CHECK (severity IN ('warning', 'critical')),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  health_snapshot jsonb NOT NULL CHECK (jsonb_typeof(health_snapshot) = 'object'),
  first_observed_at timestamptz NOT NULL DEFAULT now(),
  last_observed_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_by uuid REFERENCES users(id),
  acknowledged_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolution_notes text CHECK (resolution_notes IS NULL OR char_length(resolution_notes) BETWEEN 3 AND 1000),
  FOREIGN KEY (rollout_id, tenant_id)
    REFERENCES mobile_release_rollouts(id, tenant_id) ON DELETE CASCADE,
  CHECK (
    (status = 'open' AND acknowledged_by IS NULL AND acknowledged_at IS NULL AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status = 'acknowledged' AND acknowledged_by IS NOT NULL AND acknowledged_at IS NOT NULL AND resolved_by IS NULL AND resolved_at IS NULL)
    OR (status = 'resolved' AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL AND resolution_notes IS NOT NULL)
  )
);

CREATE UNIQUE INDEX mobile_release_incidents_one_active
  ON mobile_release_incidents(tenant_id, rollout_id)
  WHERE status IN ('open', 'acknowledged');
CREATE INDEX mobile_release_incidents_tenant_last_idx
  ON mobile_release_incidents(tenant_id, last_observed_at DESC);

CREATE TABLE mobile_release_guard_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_key text NOT NULL CHECK (char_length(run_key) BETWEEN 8 AND 120),
  summary jsonb NOT NULL CHECK (jsonb_typeof(summary) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_key)
);

ALTER TABLE mobile_release_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_release_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE mobile_release_guard_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_release_guard_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY mobile_release_incidents_tenant_isolation ON mobile_release_incidents
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mobile_release_guard_runs_tenant_isolation ON mobile_release_guard_runs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON mobile_release_incidents, mobile_release_guard_runs FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON mobile_release_incidents TO filo_app;
GRANT SELECT, INSERT ON mobile_release_guard_runs TO filo_app;

COMMENT ON TABLE mobile_release_incidents IS
  'Tenant-scoped rollout health incidents requiring explicit owner acknowledgement or resolution.';
COMMENT ON TABLE mobile_release_guard_runs IS
  'Idempotent scheduled guard executions and their bounded summaries.';
