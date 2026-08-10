import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  archiveReconciliationHandlingDeadline,
  archiveReconciliationNotificationCopy,
  archiveReconciliationOverdueReminderCopy,
} from "../src/lib/notification-retention.js";

describe("archive reconciliation notifications", () => {
  it("does not create notification copy when reconciliation found no stale attempts", () => {
    assert.equal(archiveReconciliationNotificationCopy(0), null);
  });

  it("creates an actionless warning for a positive reconciliation result", () => {
    const copy = archiveReconciliationNotificationCopy(3);
    assert.equal(copy?.sourceType, "archive_reconciliation");
    assert.equal(copy?.severity, "warning");
    assert.equal(copy?.actionTarget, null);
    assert.match(copy?.message ?? "", /^3 /);
  });
});

describe("archive reconciliation handling deadlines", () => {
  it("flags only the active lifecycle deadline when it is overdue", () => {
    const now = new Date("2026-08-05T12:00:00.000Z");
    const acknowledgementDueAt = new Date("2026-08-05T11:00:00.000Z");
    const resolutionDueAt = new Date("2026-08-06T11:00:00.000Z");
    assert.deepEqual(
      archiveReconciliationHandlingDeadline(
        "open",
        acknowledgementDueAt,
        resolutionDueAt,
        now,
      ),
      {
        handlingDeadlineAt: acknowledgementDueAt.toISOString(),
        isHandlingOverdue: true,
      },
    );
    assert.deepEqual(
      archiveReconciliationHandlingDeadline(
        "acknowledged",
        acknowledgementDueAt,
        resolutionDueAt,
        now,
      ),
      {
        handlingDeadlineAt: resolutionDueAt.toISOString(),
        isHandlingOverdue: false,
      },
    );
    assert.deepEqual(
      archiveReconciliationHandlingDeadline(
        "resolved",
        acknowledgementDueAt,
        resolutionDueAt,
        now,
      ),
      { handlingDeadlineAt: null, isHandlingOverdue: false },
    );
  });
});

describe("archive reconciliation overdue reminders", () => {
  it("uses a bounded warning for acknowledgement delay", () => {
    const copy = archiveReconciliationOverdueReminderCopy("open");
    assert.equal(copy.stage, "acknowledgement");
    assert.equal(copy.severity, "warning");
    assert.match(copy.message, /ele alma hedefini geçti/);
  });

  it("uses a critical reminder for resolution delay", () => {
    const copy = archiveReconciliationOverdueReminderCopy("acknowledged");
    assert.equal(copy.stage, "resolution");
    assert.equal(copy.severity, "critical");
    assert.match(copy.message, /çözüm hedefini geçti/);
  });

  it("keeps interrupted run errors bounded to an operational result code", () => {
    const outcomeCode = "REMINDER_SCAN_INTERRUPTED";
    assert.match(outcomeCode, /^REMINDER_SCAN_[A-Z_]+$/);
    assert.equal(outcomeCode.includes("Error:"), false);
  });
});
