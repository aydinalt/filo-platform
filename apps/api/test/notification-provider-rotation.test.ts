import assert from "node:assert/strict";
import { describe, it } from "node:test";

process.env.SESSION_SECRET = "provider-rotation-test-session-secret-at-least-32-characters";

const { changeProviderStatus, lockProviderChannel, rotateActiveProvider } = await import(
  "../src/routes/notification-providers.js"
);

describe("notification provider rotation", () => {
  it("serializes rotations by tenant and channel", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    await lockProviderChannel(async (sql, values) => {
      calls.push({ sql, values });
      return { rows: [] };
    }, "tenant-1", "email");
    assert.match(calls[0]!.sql, /pg_advisory_xact_lock/u);
    assert.match(calls[0]!.sql, /hashtextextended/u);
    assert.deepEqual(calls[0]!.values, ["tenant-1", "email"]);
  });

  it("rotates one tenant channel atomically and records the displaced profile", async () => {
    let call = 0;
    const rotated = await rotateActiveProvider(async (sql, values) => {
      call += 1;
      if (call === 1) {
        assert.match(sql, /pg_advisory_xact_lock/u);
        assert.deepEqual(values, ["tenant-1", "email"]);
        return { rows: [] };
      }
      if (call === 2) {
        assert.match(sql, /SELECT id/u);
        assert.match(sql, /FOR UPDATE/u);
        assert.deepEqual(values, ["tenant-1", "email", "provider-new"]);
        return { rows: [{ id: "provider-new" }] };
      }
      if (call === 3) {
        assert.match(sql, /WHERE tenant_id = \$1/u);
        assert.match(sql, /channel = \$2/u);
        assert.match(sql, /status = 'active'/u);
        assert.match(sql, /id <> \$3/u);
        assert.deepEqual(values, ["tenant-1", "email", "provider-new"]);
        return { rows: [{ id: "provider-old" }] };
      }
      if (call === 4) {
        assert.match(sql, /WHERE tenant_id = \$1/u);
        assert.match(sql, /channel = \$2/u);
        assert.match(sql, /id = \$3/u);
        assert.deepEqual(values, ["tenant-1", "email", "provider-new"]);
        return { rows: [{ id: "provider-new" }] };
      }
      assert.match(sql, /notification_provider\.rotated/u);
      assert.match(sql, /deactivatedProviderIds/u);
      assert.deepEqual(values, [
        "tenant-1",
        "actor-1",
        "provider-new",
        "email",
        '["provider-old"]',
      ]);
      return { rows: [] };
    }, {
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      providerProfileId: "provider-new",
      channel: "email",
    });
    assert.equal(rotated, true);
    assert.equal(call, 5);
  });

  it("does not audit a provider that cannot be activated in the tenant channel", async () => {
    let call = 0;
    const rotated = await rotateActiveProvider(async () => {
      call += 1;
      return { rows: [] };
    }, {
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      providerProfileId: "provider-missing",
      channel: "push",
    });
    assert.equal(rotated, false);
    assert.equal(call, 2);
  });
});

describe("notification provider status transitions", () => {
  it("rechecks status under the channel lock and ignores an idempotent replay", async () => {
    let call = 0;
    const result = await changeProviderStatus(async (sql, values) => {
      call += 1;
      if (call === 1) {
        assert.match(sql, /pg_advisory_xact_lock/u);
        return { rows: [] };
      }
      assert.match(sql, /SELECT status/u);
      assert.match(sql, /FOR UPDATE/u);
      assert.deepEqual(values, ["tenant-1", "email", "provider-1"]);
      return { rows: [{ status: "inactive" }] };
    }, {
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      providerProfileId: "provider-1",
      channel: "email",
      nextStatus: "inactive",
    });
    assert.equal(result, "unchanged");
    assert.equal(call, 2);
  });

  it("audits a deactivation from the locked current status", async () => {
    let call = 0;
    const result = await changeProviderStatus(async (sql, values) => {
      call += 1;
      if (call === 1) return { rows: [] };
      if (call === 2) return { rows: [{ status: "active" }] };
      if (call === 3) {
        assert.match(sql, /SET status = 'inactive'/u);
        assert.deepEqual(values, ["tenant-1", "push", "provider-1"]);
        return { rows: [] };
      }
      assert.match(sql, /notification_provider\.status_changed/u);
      assert.deepEqual(values, [
        "tenant-1", "actor-1", "provider-1", "push", "active", "inactive",
      ]);
      return { rows: [] };
    }, {
      tenantId: "tenant-1",
      actorUserId: "actor-1",
      providerProfileId: "provider-1",
      channel: "push",
      nextStatus: "inactive",
    });
    assert.equal(result, "changed");
    assert.equal(call, 4);
  });
});
