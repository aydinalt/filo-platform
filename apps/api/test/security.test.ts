import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

process.env.SESSION_SECRET = "test-secret-which-is-longer-than-32-characters";

describe("security primitives", () => {
  it("accepts a correct scrypt password and rejects a wrong one", async () => {
    const { scryptSync } = await import("node:crypto");
    const { verifyPassword } = await import("../src/lib/password.js");
    const salt = "00112233445566778899aabbccddeeff";
    const encoded = `${salt}:${scryptSync("correct-password", salt, 64).toString("hex")}`;
    assert.equal(verifyPassword("correct-password", encoded), true);
    assert.equal(verifyPassword("wrong-password", encoded), false);
  });

  it("uses a valid fallback hash for unknown login accounts", async () => {
    const { scryptSync } = await import("node:crypto");
    const { verifyLoginPassword } = await import("../src/lib/login-security.js");
    const salt = "known-user-salt";
    const encoded = `${salt}:${scryptSync("correct-password", salt, 64).toString("hex")}`;

    assert.equal(verifyLoginPassword("correct-password", encoded), true);
    assert.equal(verifyLoginPassword("wrong-password", encoded), false);
    assert.equal(verifyLoginPassword("any-password", undefined), false);
  });

  it("round-trips a signed tenant session", async () => {
    const { createSessionToken, readSessionToken } = await import("../src/lib/session.js");
    const sessionId = "30000000-0000-4000-8000-000000000001";
    const user = {
      id: "20000000-0000-4000-8000-000000000001",
      tenantId: "10000000-0000-4000-8000-000000000001",
      tenantName: "Demo Filo A.Ş.",
      email: "admin@demo.filo",
      fullName: "Demo Yönetici",
      role: "owner" as const
    };
    const token = await createSessionToken(user, sessionId);
    const decoded = await readSessionToken(token);
    assert.equal(decoded.user.id, user.id);
    assert.equal(decoded.user.tenantId, user.tenantId);
    assert.equal(decoded.sessionId, sessionId);
  });

  it("reloads the current tenant membership instead of trusting stale token claims", async () => {
    const { loadActiveSessionUser } = await import("../src/lib/auth.js");
    const currentUser = {
      id: "20000000-0000-4000-8000-000000000001",
      tenantId: "10000000-0000-4000-8000-000000000001",
      tenantName: "Demo Filo A.Ş.",
      email: "admin@demo.filo",
      fullName: "Demo Yönetici",
      role: "viewer" as const,
    };
    let receivedValues: unknown[] = [];

    const resolved = await loadActiveSessionUser(
      currentUser.id,
      currentUser.tenantId,
      "30000000-0000-4000-8000-000000000001",
      async (sql, values) => {
        assert.match(sql, /u\.disabled_at IS NULL/u);
        assert.match(sql, /m\.tenant_id = \$2/u);
        assert.match(sql, /s\.revoked_at IS NULL/u);
        assert.match(sql, /s\.expires_at > now\(\)/u);
        receivedValues = values;
        return { rows: [currentUser] };
      },
    );

    assert.deepEqual(receivedValues, [
      currentUser.id,
      currentUser.tenantId,
      "30000000-0000-4000-8000-000000000001",
    ]);
    assert.deepEqual(resolved, currentUser);
    assert.equal(resolved?.role, "viewer");
  });

  it("rejects a session whose user or tenant membership is no longer active", async () => {
    const { loadActiveSessionUser } = await import("../src/lib/auth.js");
    const resolved = await loadActiveSessionUser(
      "20000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
      async () => ({ rows: [] }),
    );

    assert.equal(resolved, null);
  });

  it("revokes only the current tenant session", async () => {
    const { revokeActiveSession } = await import("../src/lib/auth.js");
    let receivedValues: unknown[] = [];
    await revokeActiveSession(
      "20000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000001",
      "30000000-0000-4000-8000-000000000001",
      async (sql, values) => {
        assert.match(sql, /SET revoked_at = COALESCE\(revoked_at, now\(\)\)/u);
        assert.match(sql, /tenant_id = \$2 AND user_id = \$3/u);
        receivedValues = values;
        return { rows: [] };
      },
    );

    assert.deepEqual(receivedValues, [
      "30000000-0000-4000-8000-000000000001",
      "10000000-0000-4000-8000-000000000001",
      "20000000-0000-4000-8000-000000000001",
    ]);
  });

  it("keeps reminder maintenance queries explicitly tenant scoped", () => {
    const retentionSource = readFileSync(
      new URL("../src/lib/notification-retention.ts", import.meta.url),
      "utf8",
    );
    const routeSource = readFileSync(
      new URL("../src/routes/notifications.ts", import.meta.url),
      "utf8",
    );

    assert.match(
      retentionSource,
      /WHERE tenant_id=\$1 AND maintenance_key=\$2/,
    );
    assert.match(
      retentionSource,
      /WHERE tenant_id=\$2 AND status='running'/,
    );
    assert.match(routeSource, /WHERE rr\.tenant_id=\$1 ORDER BY/);
    assert.match(routeSource, /WHERE mr\.tenant_id=\$1 ORDER BY/);
    assert.match(
      routeSource,
      /FROM notification_archive_reconciliation_reminder_runs WHERE tenant_id=\$1/,
    );
    assert.match(
      routeSource,
      /LEFT JOIN memberships rm ON rm\.tenant_id=rr\.tenant_id AND rm\.user_id=rr\.initiated_by/,
    );
    assert.match(
      routeSource,
      /LEFT JOIN memberships mm ON mm\.tenant_id=mr\.tenant_id AND mm\.user_id=mr\.initiated_by/,
    );
  });
});
