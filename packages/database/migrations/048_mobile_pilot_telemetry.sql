ALTER TABLE mobile_access_credentials
  ADD COLUMN app_version text CHECK (app_version IS NULL OR char_length(app_version) BETWEEN 1 AND 40),
  ADD COLUMN os_version text CHECK (os_version IS NULL OR char_length(os_version) BETWEEN 1 AND 80),
  ADD COLUMN battery_percent smallint CHECK (battery_percent IS NULL OR battery_percent BETWEEN 0 AND 100),
  ADD COLUMN low_power_mode boolean,
  ADD COLUMN network_type text CHECK (network_type IS NULL OR network_type IN ('wifi', 'cellular', 'none', 'unknown', 'other')),
  ADD COLUMN permission_state text CHECK (permission_state IS NULL OR permission_state IN ('granted_always', 'denied', 'restricted', 'unknown')),
  ADD COLUMN mobile_tracking_state text CHECK (mobile_tracking_state IS NULL OR mobile_tracking_state IN ('tracking', 'paused', 'stopped', 'error')),
  ADD COLUMN pending_location_count integer NOT NULL DEFAULT 0 CHECK (pending_location_count BETWEEN 0 AND 1000),
  ADD COLUMN oldest_queued_at timestamptz,
  ADD COLUMN last_error_code text CHECK (last_error_code IS NULL OR char_length(last_error_code) BETWEEN 1 AND 80),
  ADD COLUMN last_heartbeat_at timestamptz,
  ADD COLUMN last_sync_at timestamptz,
  ADD COLUMN last_location_at timestamptz,
  ADD CONSTRAINT mobile_access_queue_consistency CHECK (
    (pending_location_count = 0 AND oldest_queued_at IS NULL)
    OR (pending_location_count > 0 AND oldest_queued_at IS NOT NULL)
  );

CREATE INDEX mobile_access_credentials_heartbeat_idx
  ON mobile_access_credentials(tenant_id, last_heartbeat_at DESC)
  WHERE revoked_at IS NULL;

COMMENT ON COLUMN mobile_access_credentials.last_seen_at IS
  'Authentication activity; not a mobile health signal.';
COMMENT ON COLUMN mobile_access_credentials.last_heartbeat_at IS
  'Explicit device health report used for pilot stale/offline diagnosis.';
