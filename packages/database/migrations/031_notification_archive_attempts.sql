CREATE TABLE notification_archive_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_key varchar(120) NOT NULL,
  source varchar(20) NOT NULL CHECK (source IN ('manual','scheduler','retry')),
  status varchar(20) NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','skipped','failed')),
  outcome_code varchar(60),
  retry_of_attempt_id uuid REFERENCES notification_archive_attempts(id),
  retry_number integer NOT NULL DEFAULT 0 CHECK (retry_number BETWEEN 0 AND 3),
  initiated_by uuid NOT NULL REFERENCES users(id),
  archived_count integer CHECK (archived_count IS NULL OR archived_count >= 0),
  eligible_remaining integer CHECK (eligible_remaining IS NULL OR eligible_remaining >= 0),
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_key),
  CHECK (
    (status = 'running' AND completed_at IS NULL AND outcome_code IS NULL)
    OR
    (status <> 'running' AND completed_at IS NOT NULL AND outcome_code IS NOT NULL)
  ),
  CHECK (
    (retry_number = 0 AND retry_of_attempt_id IS NULL)
    OR
    (retry_number > 0 AND retry_of_attempt_id IS NOT NULL)
  )
);

CREATE INDEX notification_archive_attempts_recent_idx
  ON notification_archive_attempts(tenant_id, created_at DESC);
CREATE UNIQUE INDEX notification_archive_attempts_retry_unique
  ON notification_archive_attempts(tenant_id, retry_of_attempt_id)
  WHERE retry_of_attempt_id IS NOT NULL;

ALTER TABLE notification_archive_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_archive_attempts FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_archive_attempts_tenant_isolation ON notification_archive_attempts
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE ALL ON notification_archive_attempts FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON notification_archive_attempts TO filo_app;
