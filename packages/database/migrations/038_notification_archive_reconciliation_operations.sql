ALTER TABLE notification_archive_reconciliations
  ADD COLUMN assigned_to uuid REFERENCES users(id),
  ADD COLUMN assigned_by uuid REFERENCES users(id),
  ADD COLUMN assigned_at timestamptz,
  ADD COLUMN acknowledgement_overdue_notified_at timestamptz,
  ADD COLUMN resolution_overdue_notified_at timestamptz;

ALTER TABLE notification_archive_reconciliations
  ADD CONSTRAINT notification_archive_reconciliations_assignment_check CHECK (
    (
      assigned_to IS NULL
      AND assigned_by IS NULL
      AND assigned_at IS NULL
    )
    OR
    (
      handling_status IN ('open','acknowledged','resolved')
      AND assigned_to IS NOT NULL
      AND assigned_by IS NOT NULL
      AND assigned_at IS NOT NULL
    )
  );

CREATE INDEX notification_archive_reconciliations_assignment_idx
  ON notification_archive_reconciliations(tenant_id, assigned_to, handling_status, created_at DESC)
  WHERE handling_status IN ('open','acknowledged');

CREATE TABLE notification_archive_reconciliation_reminder_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  run_key text NOT NULL CHECK (char_length(run_key) BETWEEN 8 AND 120),
  source varchar(20) NOT NULL CHECK (source IN ('manual','scheduler')),
  scanned_count integer NOT NULL DEFAULT 0 CHECK (scanned_count >= 0),
  notifications_created integer NOT NULL DEFAULT 0 CHECK (notifications_created >= 0),
  initiated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, run_key)
);

CREATE INDEX notification_archive_reconciliation_reminder_runs_tenant_idx
  ON notification_archive_reconciliation_reminder_runs(tenant_id, created_at DESC);

ALTER TABLE notification_archive_reconciliation_reminder_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_archive_reconciliation_reminder_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_archive_reconciliation_reminder_runs_tenant_isolation
  ON notification_archive_reconciliation_reminder_runs
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

GRANT SELECT, INSERT, UPDATE ON notification_archive_reconciliation_reminder_runs TO filo_app;
