CREATE TABLE notification_provider_health_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  failure_rate_warning_percent integer NOT NULL DEFAULT 10 CHECK (failure_rate_warning_percent BETWEEN 1 AND 100),
  queue_age_warning_seconds integer NOT NULL DEFAULT 900 CHECK (queue_age_warning_seconds BETWEEN 60 AND 86400),
  lookback_hours integer NOT NULL DEFAULT 24 CHECK (lookback_hours BETWEEN 1 AND 168),
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE notification_provider_health_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_health_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_health_settings_tenant_isolation ON notification_provider_health_settings
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_provider_health_settings TO filo_app;
