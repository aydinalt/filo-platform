CREATE TABLE notification_archive_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reconciliation_key varchar(120) NOT NULL,
  stale_after_minutes integer NOT NULL CHECK (stale_after_minutes BETWEEN 5 AND 1440),
  reconciled_count integer NOT NULL DEFAULT 0 CHECK (reconciled_count >= 0),
  initiated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, reconciliation_key),
  UNIQUE (tenant_id, id)
);

ALTER TABLE notification_archive_attempts
  ADD COLUMN heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN reconciled_at timestamptz,
  ADD COLUMN reconciled_by uuid REFERENCES users(id),
  ADD COLUMN reconciliation_id uuid,
  ADD CONSTRAINT notification_archive_attempts_reconciliation_tenant_fk
    FOREIGN KEY (tenant_id, reconciliation_id)
    REFERENCES notification_archive_reconciliations(tenant_id, id),
  ADD CONSTRAINT notification_archive_attempts_reconciliation_state_check CHECK (
    (reconciled_at IS NULL AND reconciled_by IS NULL AND reconciliation_id IS NULL)
    OR
    (status = 'failed' AND reconciled_at IS NOT NULL AND reconciled_by IS NOT NULL AND reconciliation_id IS NOT NULL)
  );

CREATE INDEX notification_archive_attempts_running_heartbeat_idx
  ON notification_archive_attempts(tenant_id, heartbeat_at)
  WHERE status = 'running';
CREATE INDEX notification_archive_reconciliations_recent_idx
  ON notification_archive_reconciliations(tenant_id, created_at DESC);

ALTER TABLE notification_archive_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_archive_reconciliations FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_archive_reconciliations_tenant_isolation ON notification_archive_reconciliations
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

REVOKE ALL ON notification_archive_reconciliations FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON notification_archive_reconciliations TO filo_app;
