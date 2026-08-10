import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  archiveReconciliationHandlingDeadline,
  archiveReconciliationNotificationCopy,
  archiveReconciliationOverdueReminderCopy,
  interruptedReminderRunPolicy,
  reminderMaintenanceHealthStatus,
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

describe("interrupted reminder run maintenance", () => {
  it("uses a fixed threshold and bounded outcome code", () => {
    assert.deepEqual(interruptedReminderRunPolicy(), {
      staleAfterMinutes: 15,
      freshnessThresholdMinutes: 30,
      outcomeCode: "REMINDER_SCAN_INTERRUPTED",
      maintenanceOutcomeCode: "REMINDER_MAINTENANCE_COMPLETED",
    });
  });

  it("keeps maintenance completion evidence bounded", () => {
    const { maintenanceOutcomeCode } = interruptedReminderRunPolicy();
    assert.equal(maintenanceOutcomeCode, "REMINDER_MAINTENANCE_COMPLETED");
    assert.match(maintenanceOutcomeCode, /^REMINDER_MAINTENANCE_[A-Z_]+$/);
  });

  it("reports stale and missing maintenance as attention states", () => {
    const now = new Date("2026-08-10T10:00:00.000Z");
    assert.deepEqual(
      reminderMaintenanceHealthStatus({
        runningCount: 2,
        staleRunningCount: 1,
        lastCompletedAt: new Date("2026-08-10T09:55:00.000Z"),
        now,
      }),
      { status: "attention", reason: "stale_runs" },
    );
    assert.deepEqual(
      reminderMaintenanceHealthStatus({
        runningCount: 0,
        staleRunningCount: 0,
        lastCompletedAt: null,
        now,
      }),
      { status: "attention", reason: "maintenance_never_completed" },
    );
  });

  it("reports overdue maintenance before active and healthy states", () => {
    const now = new Date("2026-08-10T10:00:00.000Z");
    assert.deepEqual(
      reminderMaintenanceHealthStatus({
        runningCount: 0,
        staleRunningCount: 0,
        lastCompletedAt: new Date("2026-08-10T09:29:59.999Z"),
        now,
      }),
      { status: "attention", reason: "maintenance_overdue" },
    );
    assert.deepEqual(
      reminderMaintenanceHealthStatus({
        runningCount: 1,
        staleRunningCount: 0,
        lastCompletedAt: new Date("2026-08-10T09:45:00.000Z"),
        now,
      }),
      { status: "running", reason: "active_scan" },
    );
    assert.deepEqual(
      reminderMaintenanceHealthStatus({
        runningCount: 0,
        staleRunningCount: 0,
        lastCompletedAt: new Date("2026-08-10T09:30:00.000Z"),
        now,
      }),
      { status: "healthy", reason: "recent_maintenance" },
    );
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
