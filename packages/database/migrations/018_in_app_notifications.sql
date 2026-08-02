CREATE TABLE notification_rules (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 name text NOT NULL CHECK(char_length(name) BETWEEN 2 AND 120),
 source_type text NOT NULL CHECK(source_type IN ('maintenance','document','action','safety_event','incident')),
 lead_days integer NOT NULL DEFAULT 0 CHECK(lead_days BETWEEN 0 AND 365),
 severity text NOT NULL CHECK(severity IN ('info','warning','critical')),
 target_role text CHECK(target_role IN ('owner','admin','operator','viewer')),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
 created_by uuid REFERENCES users(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,name)
);
CREATE TABLE in_app_notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id), rule_id uuid REFERENCES notification_rules(id),
 source_type text NOT NULL CHECK(source_type IN ('maintenance','document','action','safety_event','incident')), source_id uuid NOT NULL,
 title text NOT NULL CHECK(char_length(title) BETWEEN 2 AND 180), message text NOT NULL CHECK(char_length(message) BETWEEN 2 AND 1000),
 severity text NOT NULL CHECK(severity IN ('info','warning','critical')), vehicle_id uuid REFERENCES vehicles(id),
 recipient_user_id uuid NOT NULL REFERENCES users(id), read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,rule_id,source_type,source_id,recipient_user_id)
);
CREATE INDEX notification_rules_tenant_status_idx ON notification_rules(tenant_id,status,source_type);
CREATE INDEX in_app_notifications_recipient_idx ON in_app_notifications(tenant_id,recipient_user_id,read_at,created_at DESC);
ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY; ALTER TABLE notification_rules FORCE ROW LEVEL SECURITY;
ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY; ALTER TABLE in_app_notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_rules_tenant_isolation ON notification_rules USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY in_app_notifications_tenant_isolation ON in_app_notifications USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_rules,in_app_notifications TO filo_app;
