ALTER TABLE notification_delivery_outbox
 ADD COLUMN locked_by text CHECK(char_length(locked_by)<=120),
 ADD COLUMN lease_token uuid,
 ADD COLUMN lease_expires_at timestamptz;
CREATE INDEX notification_delivery_claim_idx ON notification_delivery_outbox(tenant_id,available_at,id) WHERE status IN ('pending','failed');
CREATE TABLE notification_delivery_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),tenant_id uuid NOT NULL REFERENCES tenants(id),
 delivery_id uuid NOT NULL REFERENCES notification_delivery_outbox(id),outcome text NOT NULL CHECK(outcome IN ('delivered','failed')),
 provider_message_id text CHECK(char_length(provider_message_id)<=240),error text CHECK(char_length(error)<=1000),created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_delivery_attempt_idx ON notification_delivery_attempts(tenant_id,delivery_id,created_at DESC);
ALTER TABLE notification_delivery_attempts ENABLE ROW LEVEL SECURITY;ALTER TABLE notification_delivery_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_delivery_attempt_tenant_isolation ON notification_delivery_attempts USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT ON notification_delivery_attempts TO filo_app;
