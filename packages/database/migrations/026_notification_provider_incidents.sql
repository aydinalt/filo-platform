CREATE TABLE notification_provider_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  provider_profile_id uuid NOT NULL REFERENCES notification_provider_profiles(id),
  issue_types text[] NOT NULL CHECK (cardinality(issue_types) BETWEEN 1 AND 3 AND issue_types <@ ARRAY['inactive','failure_rate','queue_delay']::text[]),
  severity text NOT NULL CHECK (severity IN ('warning','critical')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  occurrence_count integer NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  snapshot jsonb NOT NULL DEFAULT '{}',
  opened_at timestamptz NOT NULL DEFAULT now(),
  last_detected_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES users(id),
  resolution_notes text CHECK (resolution_notes IS NULL OR char_length(resolution_notes) BETWEEN 3 AND 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX notification_provider_incident_active_idx
  ON notification_provider_incidents(tenant_id,provider_profile_id)
  WHERE status IN ('open','acknowledged');
CREATE INDEX notification_provider_incident_status_idx
  ON notification_provider_incidents(tenant_id,status,last_detected_at DESC);

CREATE TABLE notification_provider_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  incident_id uuid NOT NULL REFERENCES notification_provider_incidents(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('opened','refreshed','acknowledged','resolved')),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_provider_incident_event_idx
  ON notification_provider_incident_events(tenant_id,incident_id,created_at);

ALTER TABLE notification_provider_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_incidents FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_provider_incident_events FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_incidents_tenant_isolation ON notification_provider_incidents
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY notification_provider_incident_events_tenant_isolation ON notification_provider_incident_events
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_provider_incidents TO filo_app;
GRANT SELECT,INSERT ON notification_provider_incident_events TO filo_app;
