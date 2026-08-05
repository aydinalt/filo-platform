ALTER TABLE notification_archive_reconciliations
  ADD COLUMN handling_status varchar(20) NOT NULL DEFAULT 'not_required',
  ADD COLUMN acknowledged_by uuid REFERENCES users(id),
  ADD COLUMN acknowledged_at timestamptz,
  ADD COLUMN resolved_by uuid REFERENCES users(id),
  ADD COLUMN resolved_at timestamptz,
  ADD COLUMN resolution_notes text
    CHECK (resolution_notes IS NULL OR char_length(resolution_notes) BETWEEN 3 AND 1000),
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

UPDATE notification_archive_reconciliations
SET handling_status = 'open'
WHERE reconciled_count > 0;

ALTER TABLE notification_archive_reconciliations
  ADD CONSTRAINT notification_archive_reconciliations_handling_status_check
    CHECK (handling_status IN ('not_required','open','acknowledged','resolved')),
  ADD CONSTRAINT notification_archive_reconciliations_handling_state_check CHECK (
    (
      handling_status IN ('not_required','open')
      AND acknowledged_by IS NULL
      AND acknowledged_at IS NULL
      AND resolved_by IS NULL
      AND resolved_at IS NULL
      AND resolution_notes IS NULL
    )
    OR
    (
      handling_status = 'acknowledged'
      AND acknowledged_by IS NOT NULL
      AND acknowledged_at IS NOT NULL
      AND resolved_by IS NULL
      AND resolved_at IS NULL
      AND resolution_notes IS NULL
    )
    OR
    (
      handling_status = 'resolved'
      AND acknowledged_by IS NOT NULL
      AND acknowledged_at IS NOT NULL
      AND resolved_by IS NOT NULL
      AND resolved_at IS NOT NULL
      AND resolution_notes IS NOT NULL
    )
  );

CREATE INDEX notification_archive_reconciliations_open_idx
  ON notification_archive_reconciliations(tenant_id, handling_status, created_at DESC)
  WHERE handling_status IN ('open','acknowledged');
