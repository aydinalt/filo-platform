import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { WorkerApiClient } from "../src/api-client.js";
import { loadWorkerConfig } from "../src/config.js";
import { minuteBucket, runDeliveryCycle, runSchedulerCycle } from "../src/runtime.js";

const config = loadWorkerConfig({
  NODE_ENV: "test",
  WORKER_API_URL: "http://localhost:3001",
  NOTIFICATION_WORKER_KEY: "worker-test-secret-at-least-32-characters",
  NOTIFICATION_WORKER_ID: "worker-test-1",
});
const logger = {
  warnings: [] as Record<string, unknown>[],
  info() {},
  warn(details: Record<string, unknown>) { this.warnings.push(details); },
};

describe("notification runtime scheduling", () => {
  it("creates stable minute-bucketed idempotency keys", () => {
    assert.equal(minuteBucket(new Date("2026-08-11T18:34:59.000Z")), "2026-08-11:18:34");
  });

  it("continues delivery work when one tenant scope is unavailable", async () => {
    const scopes = [
      { tenantId: "10000000-0000-4000-8000-000000000001", actorUserId: "20000000-0000-4000-8000-000000000001" },
      { tenantId: "10000000-0000-4000-8000-000000000002", actorUserId: "20000000-0000-4000-8000-000000000002" },
    ];
    const client = {
      scopes: async () => scopes,
      claim: async (scope: { tenantId: string }) => {
        if (scope.tenantId.endsWith("1")) throw new Error("unavailable");
        return [];
      },
    } as unknown as WorkerApiClient;
    const result = await runDeliveryCycle(client, config, logger);
    assert.equal(result.scopes, 2);
    assert.equal(result.deferredScopes, 1);
  });

  it("keeps a partially failed maintenance scope observable", async () => {
    const client = {
      scopes: async () => [{ tenantId: "10000000-0000-4000-8000-000000000001", actorUserId: "20000000-0000-4000-8000-000000000001" }],
      runScheduledMaintenance: async () => ({ completed: 4, failed: 1 }),
    } as unknown as WorkerApiClient;
    const result = await runSchedulerCycle(client, logger, new Date("2026-08-11T18:34:59.000Z"));
    assert.equal(result.completed, 1);
    assert.equal(logger.warnings.at(-1)?.failedJobs, 1);
  });
});
