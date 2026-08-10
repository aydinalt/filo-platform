CREATE INDEX user_sessions_dormant_cleanup_idx
  ON user_sessions (
    tenant_id,
    (GREATEST(expires_at, COALESCE(revoked_at, expires_at))),
    id
  );
