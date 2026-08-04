ALTER TABLE in_app_notifications
  DROP CONSTRAINT in_app_notifications_source_type_check;

ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_source_type_check
  CHECK (source_type IN ('maintenance','document','action','safety_event','incident','provider_incident')),
  ADD COLUMN dedupe_key text CHECK (dedupe_key IS NULL OR char_length(dedupe_key) BETWEEN 8 AND 200),
  ADD COLUMN action_target_type text CHECK (action_target_type IS NULL OR action_target_type='provider_incident'),
  ADD COLUMN action_target_id uuid,
  ADD CONSTRAINT in_app_notifications_provider_incident_action_check CHECK (
    (source_type='provider_incident' AND rule_id IS NULL AND dedupe_key IS NOT NULL AND action_target_type='provider_incident' AND action_target_id IS NOT NULL AND action_target_id=source_id)
    OR
    (source_type<>'provider_incident' AND dedupe_key IS NULL AND action_target_type IS NULL AND action_target_id IS NULL)
  );

CREATE UNIQUE INDEX in_app_notifications_dedupe_idx
  ON in_app_notifications(tenant_id,recipient_user_id,dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE INDEX in_app_notifications_action_target_idx
  ON in_app_notifications(tenant_id,action_target_type,action_target_id)
  WHERE action_target_id IS NOT NULL;
