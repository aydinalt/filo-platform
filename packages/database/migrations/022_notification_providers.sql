CREATE TABLE notification_provider_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),name text NOT NULL,
  channel text NOT NULL CHECK(channel IN ('email','push')),provider text NOT NULL CHECK(provider ~ '^[a-z0-9][a-z0-9_-]{1,39}$'),
  credential_env_ref text NOT NULL CHECK(credential_env_ref ~ '^[A-Z][A-Z0-9_]{2,79}$'),webhook_secret_env_ref text CHECK(webhook_secret_env_ref IS NULL OR webhook_secret_env_ref ~ '^[A-Z][A-Z0-9_]{2,79}$'),
  status text NOT NULL DEFAULT 'inactive' CHECK(status IN ('active','inactive')),created_by uuid NOT NULL REFERENCES users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,name));
CREATE UNIQUE INDEX notification_provider_one_active_channel_idx ON notification_provider_profiles(tenant_id,channel) WHERE status='active';
ALTER TABLE notification_delivery_outbox ADD COLUMN provider_profile_id uuid REFERENCES notification_provider_profiles(id),ADD COLUMN provider_message_id text;
ALTER TABLE notification_delivery_outbox DROP CONSTRAINT notification_delivery_outbox_status_check;
ALTER TABLE notification_delivery_outbox ADD CONSTRAINT notification_delivery_outbox_status_check CHECK(status IN ('pending','processing','delivered','failed','cancelled','bounced','complained'));
CREATE TABLE notification_provider_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),provider_profile_id uuid NOT NULL REFERENCES notification_provider_profiles(id),provider_event_id text NOT NULL,delivery_id uuid NOT NULL REFERENCES notification_delivery_outbox(id),event_type text NOT NULL CHECK(event_type IN ('delivered','bounced','complained')),provider_message_id text,occurred_at timestamptz NOT NULL,metadata jsonb NOT NULL DEFAULT '{}',received_at timestamptz NOT NULL DEFAULT now(),UNIQUE(tenant_id,provider_profile_id,provider_event_id));
ALTER TABLE notification_provider_profiles ENABLE ROW LEVEL SECURITY;ALTER TABLE notification_provider_profiles FORCE ROW LEVEL SECURITY;ALTER TABLE notification_provider_events ENABLE ROW LEVEL SECURITY;ALTER TABLE notification_provider_events FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_provider_profiles_tenant_isolation ON notification_provider_profiles USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE POLICY notification_provider_events_tenant_isolation ON notification_provider_events USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_provider_profiles TO filo_app;GRANT SELECT,INSERT ON notification_provider_events TO filo_app;
