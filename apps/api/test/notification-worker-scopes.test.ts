import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.SESSION_SECRET = "worker-scope-test-session-secret-at-least-32-characters";
process.env.NOTIFICATION_WORKER_KEY = "worker-scope-test-worker-secret-at-least-32-characters";

const { listNotificationWorkerScopes } = await import("../src/routes/notification-worker-scopes.js");

describe("notification worker scope discovery", () => {
  it("selects one active operational actor per bounded tenant scope", async () => {
    const rows = [{
      tenantId: "10000000-0000-4000-8000-000000000001",
      actorUserId: "20000000-0000-4000-8000-000000000001",
    }];
    const result = await listNotificationWorkerScopes(async (sql) => {
      assert.match(sql, /DISTINCT ON \(membership\.tenant_id\)/u);
      assert.match(sql, /membership\.role IN \('owner', 'admin', 'operator'\)/u);
      assert.match(sql, /actor\.disabled_at IS NULL/u);
      assert.match(sql, /LIMIT 500/u);
      return { rows };
    });
    assert.deepEqual(result, rows);
  });
});
