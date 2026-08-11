ALTER TABLE notification_delivery_attempts
  ADD COLUMN attempt_number integer CHECK (attempt_number BETWEEN 1 AND 10),
  ADD COLUMN worker_id text CHECK (
    worker_id IS NULL OR worker_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$'
  ),
  ADD COLUMN lease_token_hash char(64) CHECK (
    lease_token_hash IS NULL OR lease_token_hash ~ '^[0-9a-f]{64}$'
  ),
  ADD COLUMN provider_profile_id uuid REFERENCES notification_provider_profiles(id);

CREATE UNIQUE INDEX notification_delivery_attempt_lease_receipt_idx
  ON notification_delivery_attempts(tenant_id, delivery_id, lease_token_hash)
  WHERE lease_token_hash IS NOT NULL;

CREATE INDEX notification_delivery_attempt_history_idx
  ON notification_delivery_attempts(tenant_id, delivery_id, attempt_number DESC, created_at DESC);

COMMENT ON COLUMN notification_delivery_attempts.lease_token_hash IS
  'SHA-256 lease receipt retained only to make worker completion retries idempotent.';
