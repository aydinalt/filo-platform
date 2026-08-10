CREATE TABLE notification_archive_reconciliation_reminder_maintenance_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  maintenance_key text NOT NULL CHECK (char_length(maintenance_key) BETWEEN 8 AND 120),
  source varchar(20) NOT NULL CHECK (source IN ('manual','scheduler')),
  reconciled_count integer NOT NULL CHECK (reconciled_count >= 0),
  outcome_code varchar(80) NOT NULL CHECK (outcome_code = 'REMINDER_MAINTENANCE_COMPLETED'),
  stale_after_minutes integer NOT NULL CHECK (stale_after_minutes BETWEEN 1 AND 1440),
  initiated_by uuid NOT NULL REFERENCES users(id),
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, maintenance_key)
);

CREATE INDEX notification_archive_reconciliation_reminder_maintenance_runs_tenant_idx
  ON notification_archive_reconciliation_reminder_maintenance_runs(tenant_id, completed_at DESC);

ALTER TABLE notification_archive_reconciliation_reminder_maintenance_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_archive_reconciliation_reminder_maintenance_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_archive_reconciliation_reminder_maintenance_runs_tenant_isolation
  ON notification_archive_reconciliation_reminder_maintenance_runs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT ON notification_archive_reconciliation_reminder_maintenance_runs TO filo_app;
