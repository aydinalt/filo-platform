ALTER TABLE notification_retention_settings
  ADD COLUMN automatic_archive_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN archive_interval_hours integer NOT NULL DEFAULT 24 CHECK (archive_interval_hours BETWEEN 1 AND 168),
  ADD COLUMN archive_batch_size integer NOT NULL DEFAULT 500 CHECK (archive_batch_size BETWEEN 1 AND 5000),
  ADD COLUMN last_archive_at timestamptz,
  ADD COLUMN last_archive_key varchar(120),
  ADD COLUMN last_archive_summary jsonb;

ALTER TABLE notification_archive_runs
  ADD COLUMN run_key varchar(120),
  ADD COLUMN source varchar(20) NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','scheduler')),
  ADD COLUMN batch_size integer NOT NULL DEFAULT 500 CHECK (batch_size BETWEEN 1 AND 5000);

CREATE UNIQUE INDEX notification_archive_runs_run_key_unique
  ON notification_archive_runs(tenant_id,run_key)
  WHERE run_key IS NOT NULL;

CREATE INDEX notification_retention_schedule_idx
  ON notification_retention_settings(automatic_archive_enabled,last_archive_at);

GRANT SELECT,INSERT,UPDATE ON notification_retention_settings,notification_archive_runs TO filo_app;
