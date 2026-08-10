CREATE TABLE auth_login_rate_limits (
  scope text NOT NULL CHECK (scope IN ('ip', 'account')),
  key_hash char(64) NOT NULL CHECK (key_hash ~ '^[0-9a-f]{64}$'),
  attempt_count integer NOT NULL CHECK (attempt_count > 0),
  window_started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (scope, key_hash),
  CHECK (expires_at > window_started_at)
);

CREATE INDEX auth_login_rate_limits_expiry_idx
  ON auth_login_rate_limits(expires_at, scope, key_hash);

COMMENT ON TABLE auth_login_rate_limits IS
  'Pre-authentication rate-limit buckets keyed only by HMAC digests; no raw IP or email values.';

REVOKE ALL ON auth_login_rate_limits FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON auth_login_rate_limits TO filo_app;
