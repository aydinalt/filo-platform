ALTER TABLE notification_provider_incidents
  ADD COLUMN healthy_scan_count integer NOT NULL DEFAULT 0 CHECK (healthy_scan_count >= 0),
  ADD COLUMN recovery_candidate_at timestamptz,
  ADD COLUMN last_checked_at timestamptz;

ALTER TABLE notification_provider_incident_events
  DROP CONSTRAINT notification_provider_incident_events_event_type_check;
ALTER TABLE notification_provider_incident_events
  ADD CONSTRAINT notification_provider_incident_events_event_type_check
  CHECK (event_type IN ('opened','refreshed','acknowledged','resolved','recovery_candidate','recovery_cleared'));

CREATE TABLE notification_provider_incident_scan_settings (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id),
  enabled boolean NOT NULL DEFAULT true,
  interval_minutes integer NOT NULL DEFAULT 5 CHECK (interval_minutes BETWEEN 1 AND 1440),
  recovery_confirmation_scans integer NOT NULL DEFAULT 2 CHECK (recovery_confirmation_scans BETWEEN 1 AND 12),
  last_scan_at timestamptz,
  last_scan_key text,
  last_summary jsonb,
  updated_by uuid NOT NULL REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notification_provider_incident_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  scan_key text NOT NULL CHECK (char_length(scan_key) BETWEEN 8 AND 120),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  source text NOT NULL CHECK (source IN ('manual','scheduler')),
  opened_count integer NOT NULL DEFAULT 0,
  refreshed_count integer NOT NULL DEFAULT 0,
  recovery_candidate_count integer NOT NULL DEFAULT 0,
  healthy_provider_count integer NOT NULL DEFAULT 0,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, scan_key)
);
CREATE INDEX notification_provider_incident_scan_runs_recent_idx
  ON notification_provider_incident_scan_runs(tenant_id,completed_at DESC);

ALTER TABLE notification_provider_incident_scan_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_incident_scan_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_incident_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_incident_scan_runs FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_incident_scan_settings_tenant_isolation ON notification_provider_incident_scan_settings
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY notification_provider_incident_scan_runs_tenant_isolation ON notification_provider_incident_scan_runs
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_provider_incident_scan_settings TO filo_app;
GRANT SELECT,INSERT ON notification_provider_incident_scan_runs TO filo_app;
