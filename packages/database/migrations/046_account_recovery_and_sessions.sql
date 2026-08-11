ALTER TABLE in_app_notifications
  DROP CONSTRAINT in_app_notifications_source_type_check;
ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_source_type_check
  CHECK (source_type IN (
    'maintenance', 'document', 'action', 'safety_event', 'incident', 'account_recovery'
  ));

ALTER TABLE notification_delivery_outbox
  ADD COLUMN purpose text NOT NULL DEFAULT 'notification'
    CHECK (purpose IN ('notification', 'account_recovery')),
  ADD COLUMN sensitive_expires_at timestamptz;

ALTER TABLE notification_delivery_outbox
  ADD CONSTRAINT notification_delivery_sensitive_expiry_check
  CHECK (
    (purpose = 'notification' AND sensitive_expires_at IS NULL)
    OR (purpose = 'account_recovery' AND sensitive_expires_at IS NOT NULL)
  );

CREATE TABLE password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (expires_at > created_at)
);

CREATE INDEX password_reset_tokens_user_active_idx
  ON password_reset_tokens(tenant_id, user_id, expires_at DESC)
  WHERE used_at IS NULL;

ALTER TABLE password_reset_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE password_reset_tokens FORCE ROW LEVEL SECURITY;

CREATE POLICY password_reset_tokens_tenant_isolation ON password_reset_tokens
  USING (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

REVOKE ALL ON password_reset_tokens FROM PUBLIC;

CREATE OR REPLACE FUNCTION request_password_reset(
  p_email text,
  p_token_hash text,
  p_reset_url text,
  p_expires_at timestamptz
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  resolved_user_id uuid;
  resolved_tenant_id uuid;
  reset_id uuid;
  notification_id uuid;
BEGIN
  SELECT users.id, memberships.tenant_id
  INTO resolved_user_id, resolved_tenant_id
  FROM users
  JOIN memberships ON memberships.user_id = users.id
  WHERE users.email = p_email AND users.disabled_at IS NULL
  ORDER BY memberships.created_at
  LIMIT 1;

  IF resolved_user_id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.tenant_id', resolved_tenant_id::text, true);
  PERFORM set_config('app.user_id', resolved_user_id::text, true);

  UPDATE password_reset_tokens
  SET used_at = COALESCE(used_at, now())
  WHERE tenant_id = resolved_tenant_id
    AND user_id = resolved_user_id
    AND used_at IS NULL;

  UPDATE notification_delivery_outbox delivery
  SET status = CASE WHEN status IN ('pending', 'failed') THEN 'cancelled' ELSE status END,
      rendered_body = CASE
        WHEN status IN ('pending', 'failed') THEN '[redacted: superseded recovery link]'
        ELSE rendered_body
      END,
      last_error = CASE
        WHEN status IN ('pending', 'failed') THEN 'ACCOUNT_RECOVERY_SUPERSEDED'
        ELSE last_error
      END,
      updated_at = now()
  FROM in_app_notifications notification
  WHERE delivery.tenant_id = resolved_tenant_id
    AND delivery.notification_id = notification.id
    AND delivery.purpose = 'account_recovery'
    AND notification.recipient_user_id = resolved_user_id
    AND delivery.status IN ('pending', 'failed');

  INSERT INTO password_reset_tokens(tenant_id, user_id, token_hash, expires_at)
  VALUES (resolved_tenant_id, resolved_user_id, p_token_hash, p_expires_at)
  RETURNING id INTO reset_id;

  INSERT INTO in_app_notifications(
    tenant_id, source_type, source_id, title, message, severity, recipient_user_id
  ) VALUES (
    resolved_tenant_id,
    'account_recovery',
    reset_id,
    'Parola sıfırlama isteği',
    'Hesabınız için süreli bir parola sıfırlama bağlantısı oluşturuldu.',
    'info',
    resolved_user_id
  ) RETURNING id INTO notification_id;

  INSERT INTO notification_delivery_outbox(
    tenant_id, notification_id, recipient_user_id, channel, status,
    available_at, locale, rendered_subject, rendered_body,
    purpose, sensitive_expires_at
  ) VALUES (
    resolved_tenant_id,
    notification_id,
    resolved_user_id,
    'email',
    'pending',
    now(),
    'tr-TR',
    'Filo hesabınız için parola sıfırlama',
    'Parolanızı 30 dakika içinde yenilemek için bağlantıyı açın: ' || p_reset_url ||
      E'\n\nBu isteği siz yapmadıysanız bu e-postayı yok sayın.',
    'account_recovery',
    p_expires_at
  );

  INSERT INTO audit_events(
    tenant_id, actor_user_id, action, entity_type, entity_id, metadata
  ) VALUES (
    resolved_tenant_id,
    resolved_user_id,
    'account.password_reset_requested',
    'password_reset',
    reset_id::text,
    jsonb_build_object('expiresAt', p_expires_at)
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION complete_password_reset(
  p_tenant_id uuid,
  p_token_hash text,
  p_password_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  reset password_reset_tokens%ROWTYPE;
BEGIN
  PERFORM set_config('app.tenant_id', p_tenant_id::text, true);

  SELECT * INTO reset
  FROM password_reset_tokens
  WHERE tenant_id = p_tenant_id
    AND token_hash = p_token_hash
    AND used_at IS NULL
    AND expires_at > now()
  FOR UPDATE;

  IF reset.id IS NULL THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.user_id', reset.user_id::text, true);

  UPDATE users
  SET password_hash = p_password_hash
  WHERE id = reset.user_id AND disabled_at IS NULL;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  UPDATE password_reset_tokens
  SET used_at = now()
  WHERE tenant_id = p_tenant_id
    AND user_id = reset.user_id
    AND used_at IS NULL;

  UPDATE user_sessions
  SET revoked_at = COALESCE(revoked_at, now())
  WHERE tenant_id = p_tenant_id
    AND user_id = reset.user_id
    AND revoked_at IS NULL;

  UPDATE notification_delivery_outbox delivery
  SET status = CASE WHEN status IN ('pending', 'failed') THEN 'cancelled' ELSE status END,
      rendered_body = '[redacted after password reset]',
      last_error = CASE
        WHEN status IN ('pending', 'failed') THEN 'ACCOUNT_RECOVERY_COMPLETED'
        ELSE last_error
      END,
      updated_at = now()
  FROM in_app_notifications notification
  WHERE delivery.tenant_id = p_tenant_id
    AND delivery.notification_id = notification.id
    AND delivery.purpose = 'account_recovery'
    AND notification.source_id = reset.id;

  INSERT INTO audit_events(
    tenant_id, actor_user_id, action, entity_type, entity_id
  ) VALUES (
    p_tenant_id,
    reset.user_id,
    'account.password_reset_completed',
    'user',
    reset.user_id::text
  );

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION request_password_reset(text, text, text, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION complete_password_reset(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION request_password_reset(text, text, text, timestamptz) TO filo_app;
GRANT EXECUTE ON FUNCTION complete_password_reset(uuid, text, text) TO filo_app;
