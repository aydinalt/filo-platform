CREATE TABLE report_exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
  requested_by uuid NOT NULL REFERENCES users(id), format text NOT NULL CHECK(format IN ('csv')),
  date_from date NOT NULL, date_to date NOT NULL, vehicle_id uuid REFERENCES vehicles(id), created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE report_exports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_exports FORCE ROW LEVEL SECURITY;
CREATE POLICY report_exports_tenant_isolation ON report_exports USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
CREATE INDEX report_exports_tenant_created_idx ON report_exports(tenant_id,created_at DESC);
