CREATE TABLE production_launches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  readiness_review_id uuid NOT NULL,
  target_version text NOT NULL CHECK (target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  certificate_snapshot jsonb NOT NULL CHECK (jsonb_typeof(certificate_snapshot) = 'object'),
  certificate_sha256 text NOT NULL CHECK (certificate_sha256 ~ '^[0-9a-f]{64}$'),
  notes text NOT NULL CHECK (char_length(notes) BETWEEN 3 AND 1000),
  status_reason text NOT NULL CHECK (char_length(status_reason) BETWEEN 3 AND 1000),
  activated_by uuid NOT NULL REFERENCES users(id),
  activated_at timestamptz NOT NULL DEFAULT now(),
  status_updated_by uuid NOT NULL REFERENCES users(id),
  status_updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (readiness_review_id, tenant_id)
    REFERENCES launch_readiness_reviews(id, tenant_id),
  UNIQUE (tenant_id, readiness_review_id),
  UNIQUE (tenant_id, target_version),
  UNIQUE (id, tenant_id)
);

CREATE UNIQUE INDEX production_launches_one_active
  ON production_launches(tenant_id) WHERE status = 'active';
CREATE INDEX production_launches_tenant_status_idx
  ON production_launches(tenant_id, status_updated_at DESC);

CREATE TABLE production_launch_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  launch_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('activated', 'suspended', 'resumed')),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 3 AND 1000),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (launch_id, tenant_id)
    REFERENCES production_launches(id, tenant_id) ON DELETE CASCADE
);

CREATE INDEX production_launch_events_launch_idx
  ON production_launch_events(tenant_id, launch_id, created_at DESC);

CREATE FUNCTION enforce_production_launch_go()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  review launch_readiness_reviews%ROWTYPE;
BEGIN
  SELECT * INTO review FROM launch_readiness_reviews
  WHERE id = NEW.readiness_review_id AND tenant_id = NEW.tenant_id;
  IF review.id IS NULL OR review.status <> 'go' OR review.target_version <> NEW.target_version
     OR review.decision_snapshot IS NULL OR (review.decision_snapshot->>'ready')::boolean IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'production launch requires matching ready GO decision';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER production_launch_requires_go
BEFORE INSERT ON production_launches
FOR EACH ROW EXECUTE FUNCTION enforce_production_launch_go();

CREATE FUNCTION protect_production_launch_certificate()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id
     OR NEW.readiness_review_id <> OLD.readiness_review_id
     OR NEW.target_version <> OLD.target_version
     OR NEW.certificate_snapshot <> OLD.certificate_snapshot
     OR NEW.certificate_sha256 <> OLD.certificate_sha256
     OR NEW.notes <> OLD.notes
     OR NEW.activated_by <> OLD.activated_by
     OR NEW.activated_at <> OLD.activated_at THEN
    RAISE EXCEPTION 'production launch certificate is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER production_launch_certificate_immutable
BEFORE UPDATE ON production_launches
FOR EACH ROW EXECUTE FUNCTION protect_production_launch_certificate();

ALTER TABLE production_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_launches FORCE ROW LEVEL SECURITY;
ALTER TABLE production_launch_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_launch_events FORCE ROW LEVEL SECURITY;

CREATE POLICY production_launches_tenant_isolation ON production_launches
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY production_launch_events_tenant_isolation ON production_launch_events
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON production_launches, production_launch_events FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON production_launches TO filo_app;
GRANT SELECT, INSERT ON production_launch_events TO filo_app;
REVOKE ALL ON FUNCTION enforce_production_launch_go() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_production_launch_certificate() FROM PUBLIC;

COMMENT ON TABLE production_launches IS
  'One evidence-certified production activation per tenant and target version.';
COMMENT ON TABLE production_launch_events IS
  'Append-only owner activation, emergency suspension and controlled resume history.';
