CREATE TABLE action_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES tenants(id),
 source_type text NOT NULL CHECK(source_type IN ('maintenance','document','defect','safety_event','incident','manual')), source_id uuid,
 title text NOT NULL CHECK(char_length(title) BETWEEN 2 AND 180), description text,
 priority text NOT NULL CHECK(priority IN ('low','medium','high','critical')), status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','in_progress','completed','cancelled')),
 vehicle_id uuid REFERENCES vehicles(id), assigned_user_id uuid REFERENCES users(id), due_on date,
 completed_at timestamptz, completed_by uuid REFERENCES users(id), created_by uuid REFERENCES users(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(tenant_id,source_type,source_id)
);
CREATE INDEX action_items_tenant_status_idx ON action_items(tenant_id,status,priority,due_on);
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY; ALTER TABLE action_items FORCE ROW LEVEL SECURITY;
CREATE POLICY action_items_tenant_isolation ON action_items USING (tenant_id=current_setting('app.tenant_id',true)::uuid) WITH CHECK (tenant_id=current_setting('app.tenant_id',true)::uuid);
GRANT SELECT,INSERT,UPDATE ON action_items TO filo_app;
