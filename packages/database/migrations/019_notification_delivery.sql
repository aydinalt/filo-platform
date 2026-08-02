CREATE TABLE notification_preferences (
 tenant_id uuid NOT NULL REFERENCES tenants(id), user_id uuid NOT NULL REFERENCES users(id),
 email_enabled boolean NOT NULL DEFAULT true, push_enabled boolean NOT NULL DEFAULT true,
 quiet_hours_enabled boolean NOT NULL DEFAULT false, quiet_start time, quiet_end time,
 timezone text NOT NULL DEFAULT 'Europe/Istanbul' CHECK(char_length(timezone) BETWEEN 1 AND 64),
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(tenant_id,user_id),
 CHECK(NOT quiet_hours_enabled OR (quiet_start IS NOT NULL AND quiet_end IS NOT NULL))
);
CREATE TABLE notification_delivery_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 notification_id uuid NOT NULL REFERENCES in_app_notifications(id), recipient_user_id uuid NOT NULL REFERENCES users(id),
 channel text NOT NULL CHECK(channel IN ('email','push')), status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','delivered','failed','cancelled')),
 attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10), available_at timestamptz NOT NULL DEFAULT now(),
 locked_at timestamptz, delivered_at timestamptz, last_error text CHECK(char_length(last_error)<=1000),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(tenant_id,notification_id,recipient_user_id,channel)
);
CREATE INDEX notification_delivery_ready_idx ON notification_delivery_outbox(tenant_id,status,available_at) WHERE status IN ('pending','failed');
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY; ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
ALTER TABLE notification_delivery_outbox ENABLE ROW LEVEL SECURITY; ALTER TABLE notification_delivery_outbox FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_tenant_isolation ON notification_preferences USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY notification_delivery_tenant_isolation ON notification_delivery_outbox USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_preferences,notification_delivery_outbox TO filo_app;
