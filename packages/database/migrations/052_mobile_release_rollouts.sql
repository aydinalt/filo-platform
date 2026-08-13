ALTER TABLE mobile_pilot_release_approvals
  ADD CONSTRAINT mobile_pilot_release_approvals_id_tenant_unique UNIQUE (id, tenant_id);

CREATE TABLE mobile_release_rollouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  approval_id uuid NOT NULL,
  target_version text NOT NULL CHECK (target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  previous_stable_version text NOT NULL CHECK (
    previous_stable_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    AND previous_stable_version <> target_version
  ),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'completed', 'rolled_back')),
  target_percentage integer NOT NULL DEFAULT 10
    CHECK (target_percentage IN (10, 25, 50, 100)),
  max_unhealthy_percent integer NOT NULL DEFAULT 10
    CHECK (max_unhealthy_percent BETWEEN 0 AND 50),
  notes text NOT NULL CHECK (char_length(notes) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  CHECK (
    (status = 'draft' AND started_at IS NULL AND completed_at IS NULL)
    OR (status IN ('active', 'paused') AND started_at IS NOT NULL AND completed_at IS NULL)
    OR (status IN ('completed', 'rolled_back') AND started_at IS NOT NULL AND completed_at IS NOT NULL)
  ),
  UNIQUE (tenant_id, target_version),
  UNIQUE (id, tenant_id),
  FOREIGN KEY (approval_id, tenant_id)
    REFERENCES mobile_pilot_release_approvals(id, tenant_id)
);

CREATE INDEX mobile_release_rollouts_tenant_created_idx
  ON mobile_release_rollouts(tenant_id, created_at DESC);

CREATE TABLE mobile_release_rollout_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  rollout_id uuid NOT NULL,
  action text NOT NULL
    CHECK (action IN ('created', 'started', 'advanced', 'paused', 'resumed', 'completed', 'rolled_back')),
  from_percentage integer CHECK (from_percentage IS NULL OR from_percentage IN (10, 25, 50, 100)),
  to_percentage integer CHECK (to_percentage IS NULL OR to_percentage IN (10, 25, 50, 100)),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  health_snapshot jsonb NOT NULL CHECK (jsonb_typeof(health_snapshot) = 'object'),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (rollout_id, tenant_id)
    REFERENCES mobile_release_rollouts(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX mobile_release_rollout_events_rollout_idx
  ON mobile_release_rollout_events(tenant_id, rollout_id, created_at DESC);

ALTER TABLE mobile_release_rollouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_release_rollouts FORCE ROW LEVEL SECURITY;
ALTER TABLE mobile_release_rollout_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_release_rollout_events FORCE ROW LEVEL SECURITY;

CREATE POLICY mobile_release_rollouts_tenant_isolation ON mobile_release_rollouts
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mobile_release_rollout_events_tenant_isolation ON mobile_release_rollout_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON mobile_release_rollouts, mobile_release_rollout_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON mobile_release_rollouts TO filo_app;
GRANT SELECT, INSERT ON mobile_release_rollout_events TO filo_app;

COMMENT ON TABLE mobile_release_rollouts IS
  'Owner-controlled staged mobile release rollout linked to an approved physical pilot cohort.';
COMMENT ON TABLE mobile_release_rollout_events IS
  'Append-only rollout decision history with the health evidence observed at each transition.';
