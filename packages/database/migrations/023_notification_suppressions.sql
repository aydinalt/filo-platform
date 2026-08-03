CREATE TABLE notification_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  recipient_user_id uuid NOT NULL REFERENCES users(id),
  channel text NOT NULL CHECK(channel IN ('email','push')),
  reason text NOT NULL CHECK(reason IN ('hard_bounce','complaint','manual')),
  source_delivery_id uuid REFERENCES notification_delivery_outbox(id),
  details text,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_by uuid REFERENCES users(id),
  lifted_at timestamptz,
  CHECK((active AND lifted_at IS NULL AND lifted_by IS NULL) OR (NOT active AND lifted_at IS NOT NULL))
);
CREATE UNIQUE INDEX notification_suppressions_one_active_idx ON notification_suppressions(tenant_id,recipient_user_id,channel) WHERE active;
CREATE INDEX notification_suppressions_tenant_created_idx ON notification_suppressions(tenant_id,created_at DESC);
ALTER TABLE notification_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_suppressions FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_suppressions_tenant_isolation ON notification_suppressions USING(tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK(tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_suppressions TO filo_app;
