import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { archiveReconciliationNotificationCopy } from "../src/lib/notification-retention.js";

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
