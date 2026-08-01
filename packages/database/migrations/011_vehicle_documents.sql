CREATE TABLE vehicle_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  vehicle_id uuid NOT NULL REFERENCES vehicles(id),
  document_type text NOT NULL CHECK (document_type IN ('traffic_insurance','casco','inspection','registration','other')),
  document_number text CHECK (document_number IS NULL OR char_length(document_number) BETWEEN 2 AND 120),
  valid_from date,
  expires_on date,
  notes text CHECK (notes IS NULL OR char_length(notes) <= 1000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','renewed','cancelled')),
  renewed_by_document_id uuid REFERENCES vehicle_documents(id),
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_on IS NOT NULL OR document_type='registration'),
  CHECK (valid_from IS NULL OR expires_on IS NULL OR expires_on >= valid_from)
);
CREATE UNIQUE INDEX vehicle_documents_one_active_type_idx ON vehicle_documents(tenant_id,vehicle_id,document_type) WHERE status='active';
CREATE INDEX vehicle_documents_expiry_idx ON vehicle_documents(tenant_id,expires_on) WHERE status='active';
ALTER TABLE vehicle_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_documents FORCE ROW LEVEL SECURITY;
CREATE POLICY vehicle_documents_tenant_isolation ON vehicle_documents
  USING (tenant_id=current_setting('app.tenant_id',true)::uuid)
  WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON vehicle_documents TO filo_app;
