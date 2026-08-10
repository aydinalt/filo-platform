ALTER TABLE notification_archive_reconciliation_reminder_runs
  ADD COLUMN status varchar(20) NOT NULL DEFAULT 'running',
  ADD COLUMN outcome_code varchar(80),
  ADD COLUMN started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN completed_at timestamptz;

UPDATE notification_archive_reconciliation_reminder_runs
SET status = 'succeeded',
    outcome_code = 'REMINDER_SCAN_COMPLETED',
    completed_at = created_at;

ALTER TABLE notification_archive_reconciliation_reminder_runs
  ADD CONSTRAINT notification_archive_reconciliation_reminder_runs_status_check
    CHECK (status IN ('running','succeeded','failed')),
  ADD CONSTRAINT notification_archive_reconciliation_reminder_runs_lifecycle_check
    CHECK (
      (status = 'running' AND outcome_code IS NULL AND completed_at IS NULL)
      OR
      (status IN ('succeeded','failed') AND outcome_code IS NOT NULL AND completed_at IS NOT NULL)
    );

CREATE INDEX notification_archive_reconciliation_reminder_runs_status_idx
  ON notification_archive_reconciliation_reminder_runs(tenant_id, status, started_at DESC);
