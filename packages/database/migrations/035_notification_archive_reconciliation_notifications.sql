ALTER TABLE in_app_notifications
  DROP CONSTRAINT in_app_notifications_source_type_check,
  DROP CONSTRAINT in_app_notifications_provider_incident_action_check;

ALTER TABLE in_app_notifications
  ADD CONSTRAINT in_app_notifications_source_type_check CHECK (
    source_type IN (
      'maintenance',
      'document',
      'action',
      'safety_event',
      'incident',
      'provider_incident',
      'archive_reconciliation'
    )
  ),
  ADD CONSTRAINT in_app_notifications_provider_incident_action_check CHECK (
    (
      source_type = 'provider_incident'
      AND rule_id IS NULL
      AND dedupe_key IS NOT NULL
      AND action_target_type = 'provider_incident'
      AND action_target_id IS NOT NULL
      AND action_target_id = source_id
    )
    OR
    (
      source_type = 'archive_reconciliation'
      AND rule_id IS NULL
      AND dedupe_key IS NOT NULL
      AND action_target_type IS NULL
      AND action_target_id IS NULL
    )
    OR
    (
      source_type IN ('maintenance','document','action','safety_event','incident')
      AND dedupe_key IS NULL
      AND action_target_type IS NULL
      AND action_target_id IS NULL
    )
  );

ALTER TABLE notification_archive_reconciliations
  ADD COLUMN notifications_created integer NOT NULL DEFAULT 0
    CHECK (notifications_created >= 0);

CREATE INDEX in_app_notifications_archive_reconciliation_idx
  ON in_app_notifications(tenant_id, source_id, recipient_user_id)
  WHERE source_type = 'archive_reconciliation';

