import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadWorkerConfig } from "../src/config.js";

const base = {
  NODE_ENV: "test",
  WORKER_API_URL: "http://localhost:3001",
  NOTIFICATION_WORKER_KEY: "worker-test-secret-at-least-32-characters",
  NOTIFICATION_WORKER_ID: "worker-test-1",
};

describe("notification worker configuration", () => {
  it("loads bounded defaults", () => {
    const config = loadWorkerConfig(base);
    assert.equal(config.batchSize, 25);
    assert.equal(config.schedulerEnabled, true);
    assert.equal(config.allowDryRun, false);
  });

  it("rejects unsafe production transport and dry-run dispatch", () => {
    assert.throws(() => loadWorkerConfig({
      ...base,
      NODE_ENV: "production",
      EMAIL_FROM: "noreply@example.com",
    }), /HTTPS/u);
    assert.throws(() => loadWorkerConfig({
      ...base,
      NODE_ENV: "production",
      WORKER_API_URL: "https://api.example.com",
      EMAIL_FROM: "noreply@example.com",
      WORKER_ALLOW_DRY_RUN: "true",
    }), /must be false/u);
  });

  it("requires safe bounded runtime values", () => {
    assert.throws(() => loadWorkerConfig({ ...base, WORKER_BATCH_SIZE: "101" }), /between 1 and 100/u);
    assert.throws(() => loadWorkerConfig({ ...base, NOTIFICATION_WORKER_ID: "unsafe worker" }), /safe identifier/u);
  });
});
