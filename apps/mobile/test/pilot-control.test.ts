import test from "node:test";
import assert from "node:assert/strict";
import type { MobilePilotConfiguration } from "@filo/contracts";
import { decidePilotControl } from "../src/pilot-control";

const base: MobilePilotConfiguration = {
  policy: {
    trackingEnabled: true,
    minimumAppVersion: null,
    heartbeatIntervalSeconds: 60,
    updatedAt: null,
  },
  requiredAction: "none",
  commands: [],
};

test("stops tracking for tenant pause and required upgrade", () => {
  assert.equal(decidePilotControl({ ...base, requiredAction: "pause" }).stopTracking, true);
  const upgrade = decidePilotControl({
    ...base,
    requiredAction: "upgrade",
    policy: { ...base.policy, minimumAppVersion: "0.94.0" },
  });
  assert.equal(upgrade.stopTracking, true);
  assert.match(upgrade.message ?? "", /0\.94\.0/u);
});

test("prioritizes remote pause over sync and otherwise requests a queue flush", () => {
  const pause = decidePilotControl({
    ...base,
    commands: [
      { id: "1", credentialId: "2", type: "sync_now", status: "pending", reason: "sync", resultCode: null, createdAt: "", acknowledgedAt: null },
      { id: "3", credentialId: "2", type: "pause_tracking", status: "pending", reason: "pause", resultCode: null, createdAt: "", acknowledgedAt: null },
    ],
  });
  assert.equal(pause.stopTracking, true);
  assert.equal(pause.syncNow, false);

  const sync = decidePilotControl({
    ...base,
    commands: [
      { id: "1", credentialId: "2", type: "sync_now", status: "pending", reason: "sync", resultCode: null, createdAt: "", acknowledgedAt: null },
    ],
  });
  assert.equal(sync.stopTracking, false);
  assert.equal(sync.syncNow, true);

  const resume = decidePilotControl({
    ...base,
    commands: [
      { id: "4", credentialId: "2", type: "resume_tracking", status: "pending", reason: "resume", resultCode: null, createdAt: "", acknowledgedAt: null },
    ],
  });
  assert.equal(resume.stopTracking, false);
  assert.equal(resume.syncNow, false);
});
