ALTER TABLE notification_retention_settings
  ADD COLUMN automatic_reconciliation_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN reconciliation_interval_minutes integer NOT NULL DEFAULT 15
    CHECK (reconciliation_interval_minutes BETWEEN 5 AND 1440),
  ADD COLUMN reconciliation_stale_after_minutes integer NOT NULL DEFAULT 15
    CHECK (reconciliation_stale_after_minutes BETWEEN 5 AND 1440),
  ADD COLUMN last_reconciliation_at timestamptz,
  ADD COLUMN last_reconciliation_key varchar(120),
  ADD COLUMN last_reconciliation_summary jsonb;

ALTER TABLE notification_archive_reconciliations
  ADD COLUMN source varchar(20) NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','scheduler'));

CREATE INDEX notification_reconciliation_schedule_idx
  ON notification_retention_settings(
    automatic_reconciliation_enabled,
    last_reconciliation_at
  );

GRANT SELECT, INSERT, UPDATE ON
  notification_retention_settings,
  notification_archive_reconciliations
TO filo_app;
