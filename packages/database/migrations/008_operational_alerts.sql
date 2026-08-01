CREATE TABLE alert_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  type text NOT NULL CHECK (type IN ('geofence_entered','geofence_exited','speeding')),
  geofence_id uuid REFERENCES geofences(id), threshold_kph integer CHECK (threshold_kph BETWEEN 20 AND 250),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((type='speeding' AND threshold_kph IS NOT NULL AND geofence_id IS NULL) OR (type<>'speeding' AND geofence_id IS NOT NULL AND threshold_kph IS NULL))
);
CREATE UNIQUE INDEX alert_rules_tenant_name_active_idx ON alert_rules(tenant_id,lower(name)) WHERE status='active';
CREATE TABLE operational_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, tenant_id uuid NOT NULL REFERENCES tenants(id),
  rule_id uuid NOT NULL REFERENCES alert_rules(id), assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id),
  location_event_id bigint NOT NULL REFERENCES location_events(id), geofence_event_id bigint REFERENCES geofence_events(id),
  type text NOT NULL CHECK (type IN ('geofence_entered','geofence_exited','speeding')),
  occurred_at timestamptz NOT NULL, status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, acknowledged_at timestamptz, acknowledged_by uuid REFERENCES users(id),
  resolved_at timestamptz, resolved_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(rule_id,location_event_id)
);
CREATE INDEX operational_alerts_tenant_status_time_idx ON operational_alerts(tenant_id,status,occurred_at DESC);
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY; ALTER TABLE alert_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE operational_alerts ENABLE ROW LEVEL SECURITY; ALTER TABLE operational_alerts FORCE ROW LEVEL SECURITY;
CREATE POLICY alert_rules_tenant_isolation ON alert_rules USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY operational_alerts_tenant_isolation ON operational_alerts USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON alert_rules,operational_alerts TO filo_app;
GRANT USAGE,SELECT ON SEQUENCE operational_alerts_id_seq TO filo_app;
