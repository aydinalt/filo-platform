ALTER TABLE mobile_access_credentials
  ADD COLUMN device_manufacturer text NOT NULL DEFAULT 'unknown'
    CHECK (char_length(device_manufacturer) BETWEEN 1 AND 80),
  ADD COLUMN device_model text NOT NULL DEFAULT 'unknown'
    CHECK (char_length(device_model) BETWEEN 1 AND 120);

ALTER TABLE mobile_pilot_runs
  ADD COLUMN qualified_app_version text
    CHECK (qualified_app_version IS NULL OR qualified_app_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  ADD COLUMN qualified_device_manufacturer text
    CHECK (qualified_device_manufacturer IS NULL OR char_length(qualified_device_manufacturer) BETWEEN 1 AND 80),
  ADD COLUMN qualified_device_model text
    CHECK (qualified_device_model IS NULL OR char_length(qualified_device_model) BETWEEN 1 AND 120);

CREATE TABLE mobile_pilot_release_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  target_version text NOT NULL CHECK (target_version ~ '^[0-9]+\.[0-9]+\.[0-9]+$'),
  status text NOT NULL DEFAULT 'approved' CHECK (status IN ('approved', 'revoked')),
  notes text NOT NULL CHECK (char_length(notes) BETWEEN 3 AND 1000),
  readiness_snapshot jsonb NOT NULL CHECK (jsonb_typeof(readiness_snapshot) = 'object'),
  approved_by uuid NOT NULL REFERENCES users(id),
  approved_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES users(id),
  revoked_at timestamptz,
  revoke_reason text CHECK (revoke_reason IS NULL OR char_length(revoke_reason) BETWEEN 3 AND 1000),
  CHECK (
    (status = 'approved' AND revoked_by IS NULL AND revoked_at IS NULL AND revoke_reason IS NULL)
    OR (status = 'revoked' AND revoked_by IS NOT NULL AND revoked_at IS NOT NULL AND revoke_reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX mobile_pilot_release_one_active_version
  ON mobile_pilot_release_approvals(tenant_id, target_version)
  WHERE status = 'approved';
CREATE INDEX mobile_pilot_release_tenant_approved_idx
  ON mobile_pilot_release_approvals(tenant_id, approved_at DESC);

ALTER TABLE mobile_pilot_release_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_pilot_release_approvals FORCE ROW LEVEL SECURITY;
CREATE POLICY mobile_pilot_release_approvals_tenant_isolation ON mobile_pilot_release_approvals
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
REVOKE ALL ON mobile_pilot_release_approvals FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON mobile_pilot_release_approvals TO filo_app;

CREATE FUNCTION protect_mobile_pilot_release_snapshot()
RETURNS trigger LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.tenant_id <> OLD.tenant_id
     OR NEW.target_version <> OLD.target_version
     OR NEW.notes <> OLD.notes
     OR NEW.readiness_snapshot <> OLD.readiness_snapshot
     OR NEW.approved_by <> OLD.approved_by
     OR NEW.approved_at <> OLD.approved_at THEN
    RAISE EXCEPTION 'mobile pilot release approval snapshot is immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER mobile_pilot_release_snapshot_immutable
BEFORE UPDATE ON mobile_pilot_release_approvals
FOR EACH ROW EXECUTE FUNCTION protect_mobile_pilot_release_snapshot();

REVOKE ALL ON FUNCTION protect_mobile_pilot_release_snapshot() FROM PUBLIC;

CREATE OR REPLACE FUNCTION claim_mobile_enrollment(
  p_enrollment_id uuid,
  p_enrollment_hash text,
  p_credential_id uuid,
  p_credential_hash text,
  p_platform text,
  p_device_name text,
  p_device_manufacturer text,
  p_device_model text
)
RETURNS TABLE(
  credential_id uuid,
  tenant_id uuid,
  actor_user_id uuid,
  assignment_id uuid,
  vehicle_plate text,
  driver_name text,
  device_name text,
  device_manufacturer text,
  device_model text,
  platform text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  enrollment mobile_enrollments%ROWTYPE;
  credential_expires_at timestamptz := now() + interval '90 days';
BEGIN
  SELECT * INTO enrollment
  FROM mobile_enrollments
  WHERE id = p_enrollment_id
    AND token_hash = p_enrollment_hash
    AND claimed_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF enrollment.id IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.tenant_id', enrollment.tenant_id::text, true);
  PERFORM set_config('app.user_id', enrollment.issued_by::text, true);

  IF NOT EXISTS (
    SELECT 1
    FROM vehicle_driver_assignments assignment
    LEFT JOIN devices device ON device.id = assignment.device_id
    WHERE assignment.id = enrollment.assignment_id
      AND assignment.tenant_id = enrollment.tenant_id
      AND assignment.ended_at IS NULL
      AND (assignment.device_id IS NULL OR device.status = 'active')
  ) THEN RETURN; END IF;

  UPDATE mobile_enrollments SET claimed_at = now()
  WHERE id = enrollment.id AND tenant_id = enrollment.tenant_id;

  UPDATE mobile_access_credentials SET revoked_at = COALESCE(revoked_at, now())
  WHERE tenant_id = enrollment.tenant_id
    AND assignment_id = enrollment.assignment_id AND revoked_at IS NULL;

  INSERT INTO mobile_access_credentials(
    id, tenant_id, enrollment_id, assignment_id, token_hash, actor_user_id,
    platform, device_name, device_manufacturer, device_model, expires_at
  ) VALUES (
    p_credential_id, enrollment.tenant_id, enrollment.id, enrollment.assignment_id,
    p_credential_hash, enrollment.issued_by, p_platform, p_device_name,
    p_device_manufacturer, p_device_model, credential_expires_at
  );

  INSERT INTO audit_events(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    enrollment.tenant_id, enrollment.issued_by, 'mobile.enrollment_claimed',
    'mobile_credential', p_credential_id::text,
    jsonb_build_object('assignmentId', enrollment.assignment_id, 'platform', p_platform,
      'manufacturer', p_device_manufacturer, 'model', p_device_model)
  );

  RETURN QUERY
  SELECT credential.id, credential.tenant_id, credential.actor_user_id,
         credential.assignment_id, vehicle.plate, driver.full_name,
         credential.device_name, credential.device_manufacturer, credential.device_model,
         credential.platform, credential.expires_at
  FROM mobile_access_credentials credential
  JOIN vehicle_driver_assignments assignment ON assignment.id = credential.assignment_id
    AND assignment.tenant_id = credential.tenant_id
  JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id
  JOIN drivers driver ON driver.id = assignment.driver_id
  WHERE credential.id = p_credential_id;
END;
$$;

DROP FUNCTION authenticate_mobile_credential(uuid, text);
CREATE FUNCTION authenticate_mobile_credential(p_credential_id uuid, p_token_hash text)
RETURNS TABLE(
  credential_id uuid,
  tenant_id uuid,
  actor_user_id uuid,
  assignment_id uuid,
  vehicle_plate text,
  driver_name text,
  device_name text,
  device_manufacturer text,
  device_model text,
  platform text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE resolved mobile_access_credentials%ROWTYPE;
BEGIN
  SELECT * INTO resolved FROM mobile_access_credentials
  WHERE id = p_credential_id AND token_hash = p_token_hash
    AND revoked_at IS NULL AND expires_at > now();
  IF resolved.id IS NULL THEN RETURN; END IF;

  PERFORM set_config('app.tenant_id', resolved.tenant_id::text, true);
  PERFORM set_config('app.user_id', resolved.actor_user_id::text, true);
  IF NOT EXISTS (
    SELECT 1 FROM vehicle_driver_assignments
    WHERE id = resolved.assignment_id AND tenant_id = resolved.tenant_id AND ended_at IS NULL
  ) THEN RETURN; END IF;

  UPDATE mobile_access_credentials SET last_seen_at = now()
  WHERE id = resolved.id AND tenant_id = resolved.tenant_id;

  RETURN QUERY
  SELECT credential.id, credential.tenant_id, credential.actor_user_id,
         credential.assignment_id, vehicle.plate, driver.full_name,
         credential.device_name, credential.device_manufacturer, credential.device_model,
         credential.platform, credential.expires_at
  FROM mobile_access_credentials credential
  JOIN vehicle_driver_assignments assignment ON assignment.id = credential.assignment_id
    AND assignment.tenant_id = credential.tenant_id
  JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id
  JOIN drivers driver ON driver.id = assignment.driver_id
  WHERE credential.id = resolved.id;
END;
$$;

REVOKE ALL ON FUNCTION claim_mobile_enrollment(uuid, text, uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION authenticate_mobile_credential(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_mobile_enrollment(uuid, text, uuid, text, text, text, text, text) TO filo_app;
GRANT EXECUTE ON FUNCTION authenticate_mobile_credential(uuid, text) TO filo_app;

COMMENT ON TABLE mobile_pilot_release_approvals IS
  'Owner production approval with immutable readiness snapshot for one mobile version.';
