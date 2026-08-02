CREATE TABLE notification_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  key text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('email','push')),
  locale text NOT NULL CHECK (locale ~ '^[a-z]{2}(-[A-Z]{2})?$'),
  subject_template text NOT NULL,
  body_template text NOT NULL,
  required_variables text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id,key,channel,locale)
);
ALTER TABLE notification_delivery_outbox
  ADD COLUMN template_id uuid REFERENCES notification_templates(id),
  ADD COLUMN locale text NOT NULL DEFAULT 'tr-TR',
  ADD COLUMN rendered_subject text,
  ADD COLUMN rendered_body text;
CREATE INDEX notification_template_lookup_idx ON notification_templates(tenant_id,key,channel,locale) WHERE status='active';
ALTER TABLE notification_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_templates FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_template_tenant_isolation ON notification_templates
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON notification_templates TO filo_app;

