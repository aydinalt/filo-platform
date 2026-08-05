ALTER TABLE notification_archive_reconciliations
  ADD COLUMN acknowledgement_due_at timestamptz,
  ADD COLUMN resolution_due_at timestamptz;

UPDATE notification_archive_reconciliations
SET acknowledgement_due_at = created_at + interval '1 hour',
    resolution_due_at = created_at + interval '24 hours'
WHERE reconciled_count > 0;

ALTER TABLE notification_archive_reconciliations
  ADD CONSTRAINT notification_archive_reconciliations_deadline_state_check CHECK (
    (
      handling_status = 'not_required'
      AND acknowledgement_due_at IS NULL
      AND resolution_due_at IS NULL
    )
    OR
    (
      handling_status IN ('open','acknowledged','resolved')
      AND acknowledgement_due_at IS NOT NULL
      AND resolution_due_at IS NOT NULL
      AND resolution_due_at >= acknowledgement_due_at
    )
  );

CREATE INDEX notification_archive_reconciliations_deadline_idx
  ON notification_archive_reconciliations(
    tenant_id,
    handling_status,
    acknowledgement_due_at,
    resolution_due_at
  )
  WHERE handling_status IN ('open','acknowledged');
