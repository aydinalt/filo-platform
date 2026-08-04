CREATE TABLE notification_retention_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  read_retention_days integer NOT NULL DEFAULT 90 CHECK (read_retention_days BETWEEN 30 AND 730),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_archive_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  cutoff_at timestamptz NOT NULL,
  retention_days integer NOT NULL CHECK (retention_days BETWEEN 30 AND 730),
  archived_count integer NOT NULL DEFAULT 0 CHECK (archived_count >= 0),
  initiated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE in_app_notifications
  ADD COLUMN archived_at timestamptz,
  ADD COLUMN archived_by uuid REFERENCES users(id),
  ADD COLUMN archive_batch_id uuid REFERENCES notification_archive_runs(id),
  ADD CONSTRAINT in_app_notifications_archive_state_check CHECK (
    (archived_at IS NULL AND archived_by IS NULL AND archive_batch_id IS NULL)
    OR
    (archived_at IS NOT NULL AND archived_by IS NOT NULL AND archive_batch_id IS NOT NULL)
  );

CREATE INDEX in_app_notifications_archive_idx
  ON in_app_notifications(tenant_id,archived_at,read_at,created_at DESC);
CREATE INDEX notification_archive_runs_tenant_idx
  ON notification_archive_runs(tenant_id,created_at DESC);

ALTER TABLE notification_retention_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_retention_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_archive_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_archive_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY notification_retention_settings_tenant_isolation ON notification_retention_settings
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY notification_archive_runs_tenant_isolation ON notification_archive_runs
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);

REVOKE ALL ON notification_retention_settings,notification_archive_runs FROM PUBLIC;
GRANT SELECT,INSERT,UPDATE ON notification_retention_settings,notification_archive_runs TO filo_app;
