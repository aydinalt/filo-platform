CREATE TABLE launch_readiness_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_version text NOT NULL CHECK (target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'go', 'no_go')),
  notes text NOT NULL CHECK (char_length(notes) BETWEEN 3 AND 1000),
  created_by uuid NOT NULL REFERENCES users(id),
  decision_notes text CHECK (decision_notes IS NULL OR char_length(decision_notes) BETWEEN 3 AND 1000),
  decision_snapshot jsonb CHECK (decision_snapshot IS NULL OR jsonb_typeof(decision_snapshot) = 'object'),
  decided_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  CHECK (
    (status = 'draft' AND decision_notes IS NULL AND decision_snapshot IS NULL AND decided_by IS NULL AND decided_at IS NULL)
    OR (status IN ('go', 'no_go') AND decision_notes IS NOT NULL AND decision_snapshot IS NOT NULL
        AND decided_by IS NOT NULL AND decided_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX launch_readiness_one_draft
  ON launch_readiness_reviews(tenant_id, target_version)
  WHERE status = 'draft';
CREATE INDEX launch_readiness_tenant_created_idx
  ON launch_readiness_reviews(tenant_id, created_at DESC);

ALTER TABLE launch_readiness_reviews
  ADD CONSTRAINT launch_readiness_reviews_id_tenant_unique UNIQUE (id, tenant_id);

CREATE TABLE launch_readiness_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  review_id uuid NOT NULL,
  evidence_type text NOT NULL CHECK (evidence_type IN (
    'privacy_legal', 'backup_restore', 'worker_continuity',
    'monitoring_alerts', 'support_oncall', 'rollback_drill'
  )),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'passed')),
  notes text CHECK (notes IS NULL OR char_length(notes) BETWEEN 3 AND 1000),
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz,
  UNIQUE (tenant_id, review_id, evidence_type),
  FOREIGN KEY (review_id, tenant_id)
    REFERENCES launch_readiness_reviews(id, tenant_id) ON DELETE CASCADE,
  CHECK (
    (status = 'pending' AND notes IS NULL AND updated_by IS NULL AND updated_at IS NULL)
    OR (notes IS NOT NULL AND updated_by IS NOT NULL AND updated_at IS NOT NULL)
  )
);

CREATE FUNCTION protect_launch_readiness_decision()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    RAISE EXCEPTION 'launch readiness decision is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER launch_readiness_decision_immutable
BEFORE UPDATE ON launch_readiness_reviews
FOR EACH ROW EXECUTE FUNCTION protect_launch_readiness_decision();

CREATE FUNCTION protect_decided_launch_evidence()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM launch_readiness_reviews review
    WHERE review.id = OLD.review_id AND review.tenant_id = OLD.tenant_id AND review.status <> 'draft'
  ) THEN
    RAISE EXCEPTION 'decided launch readiness evidence is immutable';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER launch_readiness_evidence_immutable
BEFORE UPDATE OR DELETE ON launch_readiness_evidence
FOR EACH ROW EXECUTE FUNCTION protect_decided_launch_evidence();

ALTER TABLE launch_readiness_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_readiness_reviews FORCE ROW LEVEL SECURITY;
ALTER TABLE launch_readiness_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE launch_readiness_evidence FORCE ROW LEVEL SECURITY;

CREATE POLICY launch_readiness_reviews_tenant_isolation ON launch_readiness_reviews
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY launch_readiness_evidence_tenant_isolation ON launch_readiness_evidence
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON launch_readiness_reviews, launch_readiness_evidence FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON launch_readiness_reviews TO filo_app;
GRANT SELECT, INSERT, UPDATE ON launch_readiness_evidence TO filo_app;
REVOKE ALL ON FUNCTION protect_launch_readiness_decision() FROM PUBLIC;
REVOKE ALL ON FUNCTION protect_decided_launch_evidence() FROM PUBLIC;

COMMENT ON TABLE launch_readiness_reviews IS
  'Owner-controlled and immutable evidence-backed production go/no-go decisions.';
COMMENT ON TABLE launch_readiness_evidence IS
  'Required legal, recovery, worker, monitoring, support and rollback evidence for launch.';
