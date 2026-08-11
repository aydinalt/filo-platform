CREATE TABLE mobile_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 2 AND 80),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  issued_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE TABLE mobile_access_credentials (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  enrollment_id uuid NOT NULL UNIQUE REFERENCES mobile_enrollments(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES vehicle_driver_assignments(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  actor_user_id uuid NOT NULL REFERENCES users(id),
  platform text NOT NULL CHECK (platform IN ('android', 'ios')),
  device_name text NOT NULL CHECK (char_length(device_name) BETWEEN 2 AND 100),
  expires_at timestamptz NOT NULL,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX mobile_enrollments_tenant_created_idx
  ON mobile_enrollments(tenant_id, created_at DESC);
CREATE INDEX mobile_access_credentials_active_idx
  ON mobile_access_credentials(tenant_id, assignment_id, expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE mobile_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_enrollments FORCE ROW LEVEL SECURITY;
ALTER TABLE mobile_access_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE mobile_access_credentials FORCE ROW LEVEL SECURITY;

CREATE POLICY mobile_enrollments_tenant_isolation ON mobile_enrollments
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY mobile_access_credentials_tenant_isolation ON mobile_access_credentials
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON mobile_enrollments, mobile_access_credentials FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON mobile_enrollments, mobile_access_credentials TO filo_app;

CREATE OR REPLACE FUNCTION claim_mobile_enrollment(
  p_enrollment_id uuid,
  p_enrollment_hash text,
  p_credential_id uuid,
  p_credential_hash text,
  p_platform text,
  p_device_name text
)
RETURNS TABLE(
  credential_id uuid,
  tenant_id uuid,
  actor_user_id uuid,
  assignment_id uuid,
  vehicle_plate text,
  driver_name text,
  device_name text,
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

  IF enrollment.id IS NULL THEN
    RETURN;
  END IF;

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
  ) THEN
    RETURN;
  END IF;

  UPDATE mobile_enrollments
  SET claimed_at = now()
  WHERE id = enrollment.id AND tenant_id = enrollment.tenant_id;

  UPDATE mobile_access_credentials
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE tenant_id = enrollment.tenant_id
    AND assignment_id = enrollment.assignment_id
    AND revoked_at IS NULL;

  INSERT INTO mobile_access_credentials(
    id, tenant_id, enrollment_id, assignment_id, token_hash, actor_user_id,
    platform, device_name, expires_at
  ) VALUES (
    p_credential_id, enrollment.tenant_id, enrollment.id, enrollment.assignment_id,
    p_credential_hash, enrollment.issued_by, p_platform, p_device_name,
    credential_expires_at
  );

  INSERT INTO audit_events(
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    enrollment.tenant_id, enrollment.issued_by, 'mobile.enrollment_claimed',
    'mobile_credential', p_credential_id::text,
    jsonb_build_object('assignmentId', enrollment.assignment_id, 'platform', p_platform)
  );

  RETURN QUERY
  SELECT credential.id, credential.tenant_id, credential.actor_user_id,
         credential.assignment_id, vehicle.plate, driver.full_name,
         credential.device_name, credential.platform, credential.expires_at
  FROM mobile_access_credentials credential
  JOIN vehicle_driver_assignments assignment ON assignment.id = credential.assignment_id
    AND assignment.tenant_id = credential.tenant_id
  JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id
  JOIN drivers driver ON driver.id = assignment.driver_id
  WHERE credential.id = p_credential_id;
END;
$$;

CREATE OR REPLACE FUNCTION authenticate_mobile_credential(
  p_credential_id uuid,
  p_token_hash text
)
RETURNS TABLE(
  credential_id uuid,
  tenant_id uuid,
  actor_user_id uuid,
  assignment_id uuid,
  vehicle_plate text,
  driver_name text,
  device_name text,
  platform text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resolved mobile_access_credentials%ROWTYPE;
BEGIN
  SELECT * INTO resolved
  FROM mobile_access_credentials
  WHERE id = p_credential_id
    AND token_hash = p_token_hash
    AND revoked_at IS NULL
    AND expires_at > now();

  IF resolved.id IS NULL THEN
    RETURN;
  END IF;

  PERFORM set_config('app.tenant_id', resolved.tenant_id::text, true);
  PERFORM set_config('app.user_id', resolved.actor_user_id::text, true);

  IF NOT EXISTS (
    SELECT 1 FROM vehicle_driver_assignments
    WHERE id = resolved.assignment_id
      AND tenant_id = resolved.tenant_id
      AND ended_at IS NULL
  ) THEN
    RETURN;
  END IF;

  UPDATE mobile_access_credentials
  SET last_seen_at = now()
  WHERE id = resolved.id AND tenant_id = resolved.tenant_id;

  RETURN QUERY
  SELECT credential.id, credential.tenant_id, credential.actor_user_id,
         credential.assignment_id, vehicle.plate, driver.full_name,
         credential.device_name, credential.platform, credential.expires_at
  FROM mobile_access_credentials credential
  JOIN vehicle_driver_assignments assignment ON assignment.id = credential.assignment_id
    AND assignment.tenant_id = credential.tenant_id
  JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id
  JOIN drivers driver ON driver.id = assignment.driver_id
  WHERE credential.id = resolved.id;
END;
$$;

REVOKE ALL ON FUNCTION claim_mobile_enrollment(uuid, text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION authenticate_mobile_credential(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_mobile_enrollment(uuid, text, uuid, text, text, text) TO filo_app;
GRANT EXECUTE ON FUNCTION authenticate_mobile_credential(uuid, text) TO filo_app;
