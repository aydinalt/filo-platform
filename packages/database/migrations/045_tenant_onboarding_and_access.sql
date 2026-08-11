CREATE TABLE membership_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(email)),
  role membership_role NOT NULL CHECK (role <> 'owner'),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  invited_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);

CREATE UNIQUE INDEX membership_invitations_pending_email_idx
  ON membership_invitations(tenant_id, email)
  WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX membership_invitations_tenant_created_idx
  ON membership_invitations(tenant_id, created_at DESC);

CREATE TABLE legal_acceptances (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('terms', 'privacy')),
  document_version text NOT NULL CHECK (document_version ~ '^[a-z0-9][a-z0-9._-]{1,39}$'),
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, document_type, document_version)
);

ALTER TABLE membership_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_invitations FORCE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE legal_acceptances FORCE ROW LEVEL SECURITY;

CREATE POLICY membership_invitations_tenant_isolation ON membership_invitations
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
CREATE POLICY legal_acceptances_tenant_isolation ON legal_acceptances
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON membership_invitations, legal_acceptances FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE ON membership_invitations TO filo_app;
GRANT SELECT ON legal_acceptances TO filo_app;
GRANT USAGE, SELECT ON SEQUENCE legal_acceptances_id_seq TO filo_app;

CREATE OR REPLACE FUNCTION bootstrap_tenant_owner(
  p_tenant_name text,
  p_tenant_slug text,
  p_email text,
  p_full_name text,
  p_password_hash text,
  p_terms_version text,
  p_privacy_version text,
  p_session_id uuid,
  p_session_expires_at timestamptz
)
RETURNS TABLE (
  "tenantId" uuid,
  "tenantName" text,
  "userId" uuid,
  email text,
  "fullName" text,
  role membership_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  created_tenant_id uuid;
  created_user_id uuid;
BEGIN
  INSERT INTO tenants(name, slug)
  VALUES (p_tenant_name, p_tenant_slug)
  RETURNING id INTO created_tenant_id;

  INSERT INTO users(email, full_name, password_hash)
  VALUES (p_email, p_full_name, p_password_hash)
  RETURNING id INTO created_user_id;

  INSERT INTO memberships(tenant_id, user_id, role)
  VALUES (created_tenant_id, created_user_id, 'owner');

  PERFORM set_config('app.tenant_id', created_tenant_id::text, true);
  PERFORM set_config('app.user_id', created_user_id::text, true);

  INSERT INTO user_sessions(id, tenant_id, user_id, expires_at)
  VALUES (p_session_id, created_tenant_id, created_user_id, p_session_expires_at);

  INSERT INTO legal_acceptances(tenant_id, user_id, document_type, document_version)
  VALUES
    (created_tenant_id, created_user_id, 'terms', p_terms_version),
    (created_tenant_id, created_user_id, 'privacy', p_privacy_version);

  INSERT INTO audit_events(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    created_tenant_id,
    created_user_id,
    'tenant.onboarded',
    'tenant',
    created_tenant_id::text,
    jsonb_build_object('slug', p_tenant_slug)
  );

  RETURN QUERY SELECT
    created_tenant_id,
    p_tenant_name,
    created_user_id,
    p_email,
    p_full_name,
    'owner'::membership_role;
END;
$$;

CREATE OR REPLACE FUNCTION accept_membership_invitation(
  p_tenant_id uuid,
  p_token_hash text,
  p_full_name text,
  p_password_hash text,
  p_session_id uuid,
  p_session_expires_at timestamptz
)
RETURNS TABLE (
  "tenantId" uuid,
  "tenantName" text,
  "userId" uuid,
  email text,
  "fullName" text,
  role membership_role
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  invitation membership_invitations%ROWTYPE;
  created_user_id uuid;
  resolved_tenant_name text;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  SELECT * INTO invitation
  FROM membership_invitations
  WHERE tenant_id = p_tenant_id
    AND token_hash = p_token_hash
    AND accepted_at IS NULL
    AND revoked_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF invitation.id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO users(email, full_name, password_hash)
  VALUES (invitation.email, p_full_name, p_password_hash)
  RETURNING id INTO created_user_id;

  INSERT INTO memberships(tenant_id, user_id, role)
  VALUES (invitation.tenant_id, created_user_id, invitation.role);

  PERFORM set_config('app.user_id', created_user_id::text, true);

  INSERT INTO user_sessions(id, tenant_id, user_id, expires_at)
  VALUES (p_session_id, invitation.tenant_id, created_user_id, p_session_expires_at);

  UPDATE membership_invitations
  SET accepted_at = now()
  WHERE id = invitation.id AND tenant_id = p_tenant_id;

  SELECT name INTO resolved_tenant_name
  FROM tenants
  WHERE id = invitation.tenant_id;

  INSERT INTO audit_events(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    invitation.tenant_id,
    created_user_id,
    'member.invitation_accepted',
    'membership',
    created_user_id::text,
    jsonb_build_object('invitationId', invitation.id, 'role', invitation.role)
  );

  RETURN QUERY SELECT
    invitation.tenant_id,
    resolved_tenant_name,
    created_user_id,
    invitation.email,
    p_full_name,
    invitation.role;
END;
$$;

CREATE OR REPLACE FUNCTION inspect_membership_invitation(
  p_tenant_id uuid,
  p_token_hash text
)
RETURNS TABLE (
  "tenantName" text,
  email text,
  role membership_role,
  "expiresAt" timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);
  RETURN QUERY SELECT tenant.name, invitation.email, invitation.role, invitation.expires_at
  FROM membership_invitations invitation
  JOIN tenants tenant ON tenant.id = invitation.tenant_id
  WHERE invitation.tenant_id = p_tenant_id
    AND invitation.token_hash = p_token_hash
    AND invitation.accepted_at IS NULL
    AND invitation.revoked_at IS NULL
    AND invitation.expires_at > now()
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION set_member_access(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_enabled boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  actor_role membership_role;
  target_role membership_role;
BEGIN
  SELECT role INTO actor_role
  FROM memberships
  WHERE tenant_id = p_tenant_id AND user_id = p_actor_user_id;

  SELECT role INTO target_role
  FROM memberships
  WHERE tenant_id = p_tenant_id AND user_id = p_target_user_id
  FOR UPDATE;

  IF actor_role <> 'owner' OR target_role IS NULL OR target_role = 'owner'
     OR p_actor_user_id = p_target_user_id THEN
    RETURN false;
  END IF;

  UPDATE users
  SET disabled_at = CASE WHEN p_enabled THEN NULL ELSE now() END
  WHERE id = p_target_user_id;

  IF NOT p_enabled THEN
    UPDATE user_sessions
    SET revoked_at = COALESCE(revoked_at, now())
    WHERE tenant_id = p_tenant_id
      AND user_id = p_target_user_id
      AND revoked_at IS NULL;
  END IF;

  INSERT INTO audit_events(tenant_id, actor_user_id, action, entity_type, entity_id, metadata)
  VALUES (
    p_tenant_id,
    p_actor_user_id,
    CASE WHEN p_enabled THEN 'member.access_enabled' ELSE 'member.access_disabled' END,
    'membership',
    p_target_user_id::text,
    jsonb_build_object('enabled', p_enabled)
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_tenant_owner(text, text, text, text, text, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION accept_membership_invitation(uuid, text, text, text, uuid, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION inspect_membership_invitation(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION set_member_access(uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bootstrap_tenant_owner(text, text, text, text, text, text, text, uuid, timestamptz) TO filo_app;
GRANT EXECUTE ON FUNCTION accept_membership_invitation(uuid, text, text, text, uuid, timestamptz) TO filo_app;
GRANT EXECUTE ON FUNCTION inspect_membership_invitation(uuid, text) TO filo_app;
GRANT EXECUTE ON FUNCTION set_member_access(uuid, uuid, uuid, boolean) TO filo_app;
