import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyMobileDeviceHealth } from "../src/lib/mobile-device-health.js";

const now = new Date("2026-08-12T12:00:00.000Z");
const base = {
  lastHeartbeatAt: new Date("2026-08-12T11:59:00.000Z"),
  permission: "granted_always",
  trackingState: "tracking",
  pendingLocationCount: 0,
  oldestQueuedAt: null,
  lastErrorCode: null,
};

describe("mobile pilot device health classification", () => {
  it("prioritizes missing and stale heartbeats", () => {
    assert.equal(classifyMobileDeviceHealth({ ...base, lastHeartbeatAt: null }, now), "never_seen");
    assert.equal(classifyMobileDeviceHealth({
      ...base, lastHeartbeatAt: new Date("2026-08-12T11:49:59.000Z"),
    }, now), "offline");
  });

  it("surfaces permission, runtime and queue failures before healthy state", () => {
    assert.equal(classifyMobileDeviceHealth({ ...base, permission: "denied" }, now), "permission_issue");
    assert.equal(classifyMobileDeviceHealth({ ...base, lastErrorCode: "BACKGROUND_LOCATION_DENIED" }, now), "tracking_error");
    assert.equal(classifyMobileDeviceHealth({
      ...base,
      pendingLocationCount: 12,
      oldestQueuedAt: new Date("2026-08-12T11:54:00.000Z"),
    }, now), "delayed");
    assert.equal(classifyMobileDeviceHealth(base, now), "healthy");
    assert.equal(classifyMobileDeviceHealth({ ...base, trackingState: "stopped" }, now), "idle");
  });
});
