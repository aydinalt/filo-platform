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

  it("uses persistent opaque login buckets across API instances", async () => {
    const {
      consumeLoginRateLimitBucket,
      consumePersistentLoginAttempt,
      loginRateLimitKey,
    } = await import("../src/lib/login-rate-limit.js");
    const rawIp = "203.0.113.25";
    const rawEmail = "person@example.test";
    const ipKey = loginRateLimitKey("ip", rawIp);
    const accountKey = loginRateLimitKey("account", rawEmail);

    assert.match(ipKey, /^[0-9a-f]{64}$/u);
    assert.match(accountKey, /^[0-9a-f]{64}$/u);
    assert.notEqual(ipKey, accountKey);
    assert.doesNotMatch(ipKey, /203|113|25/u);
    assert.doesNotMatch(accountKey, /person|example/u);

    let bucketSql = "";
    let bucketValues: unknown[] = [];
    const firstWindowStartedAt = "2026-08-10 11:00:00.123456+00";
    const bucket = await consumeLoginRateLimitBucket(
      "ip",
      rawIp,
      5,
      60_000,
      async (sql, values) => {
        bucketSql = sql;
        bucketValues = values;
        return {
          rows: [{
            limited: true,
            retryAfter: 42,
            attemptCount: 5,
            windowStartedAt: firstWindowStartedAt,
          }],
        };
      },
    );

    assert.deepEqual(bucket, {
      limited: true,
      retryAfter: 42,
      attemptCount: 5,
      windowStartedAt: firstWindowStartedAt,
    });
    assert.match(bucketSql, /ON CONFLICT \(scope, key_hash\) DO UPDATE/u);
    assert.match(bucketSql, /auth_login_rate_limits\.attempt_count \+ 1/u);
    assert.match(bucketSql, /scope <> \$1 OR key_hash <> \$2/u);
    assert.match(bucketSql, /ORDER BY expires_at, scope, key_hash\s+LIMIT 100/u);
    assert.match(
      bucketSql,
      /RETURNING attempt_count, window_started_at, expires_at/u,
    );
    assert.match(
      bucketSql,
      /window_started_at::text AS "windowStartedAt"/u,
    );
    assert.doesNotMatch(bucketSql, /203\.0\.113\.25|person@example/u);
    assert.deepEqual(bucketValues, ["ip", ipKey, 5, 60_000]);

    const calls: unknown[][] = [];
    const windowStartedAt = "2026-08-10 12:00:00.123456+00";
    const combined = await consumePersistentLoginAttempt(
      rawIp,
      rawEmail,
      async (_sql, values) => {
        calls.push(values);
        return {
          rows: [{
            limited: calls.length === 2,
            retryAfter: calls.length === 2 ? 55 : 30,
            attemptCount: calls.length,
            windowStartedAt,
          }],
        };
      },
    );

    assert.equal(calls.length, 2);
    assert.deepEqual(calls.map((values) => values[0]), ["ip", "account"]);
    assert.equal(calls[0]?.[1], ipKey);
    assert.equal(calls[1]?.[1], accountKey);
    assert.deepEqual(combined, {
      limited: true,
      retryAfter: 55,
      accountSnapshot: { attemptCount: 2, windowStartedAt },
    });
  });

  it("clears only an unchanged verified account login bucket", async () => {
    const { clearUnchangedLoginRateLimitBucket, loginRateLimitKey } = await import(
      "../src/lib/login-rate-limit.js"
    );
    const rawEmail = "person@example.test";
    const accountKey = loginRateLimitKey("account", rawEmail);
    const windowStartedAt = "2026-08-10 12:00:00.123456+00";
    let clearSql = "";
    let clearValues: unknown[] = [];
    await clearUnchangedLoginRateLimitBucket(
      "account",
      rawEmail,
      { attemptCount: 3, windowStartedAt },
      async (sql, values) => {
        clearSql = sql;
        clearValues = values;
        return { rows: [] };
      },
    );
    assert.match(clearSql, /DELETE FROM auth_login_rate_limits/u);
    assert.match(clearSql, /WHERE scope = \$1 AND key_hash = \$2/u);
    assert.match(clearSql, /attempt_count = \$3 AND window_started_at = \$4::timestamptz/u);
    assert.deepEqual(clearValues, ["account", accountKey, 3, windowStartedAt]);
  });

  it("reports retry time only from buckets that are actually limiting login", async () => {
    const { consumePersistentLoginAttempt } = await import(
      "../src/lib/login-rate-limit.js"
    );
    const accountOnlyCalls: unknown[][] = [];
    const accountOnly = await consumePersistentLoginAttempt(
      "203.0.113.26",
      "person@example.test",
      async (_sql, values) => {
        accountOnlyCalls.push(values);
        const accountBucket = accountOnlyCalls.length === 2;
        return {
          rows: [{
            limited: accountBucket,
            retryAfter: accountBucket ? 2 : 60,
            attemptCount: accountOnlyCalls.length,
            windowStartedAt: "2026-08-10 12:00:00.123456+00",
          }],
        };
      },
    );
    assert.equal(accountOnly.limited, true);
    assert.equal(accountOnly.retryAfter, 2);

    const bothCalls: unknown[][] = [];
    const both = await consumePersistentLoginAttempt(
      "203.0.113.27",
      "person@example.test",
      async (_sql, values) => {
        bothCalls.push(values);
        return {
          rows: [{
            limited: true,
            retryAfter: bothCalls.length === 1 ? 12 : 25,
            attemptCount: bothCalls.length,
            windowStartedAt: "2026-08-10 12:00:00.123456+00",
          }],
        };
      },
    );
    assert.equal(both.limited, true);
    assert.equal(both.retryAfter, 25);
  });

  it("passes the consumed account snapshot into the session transaction", () => {
    const authRouteSource = readFileSync(
      new URL("../src/routes/auth.ts", import.meta.url),
      "utf8",
    );
    assert.match(
      authRouteSource,
      /withTenantTransaction[\s\S]+INSERT INTO user_sessions[\s\S]+clearUnchangedLoginRateLimitBucket\(\s*"account",\s*parsed\.data\.email,\s*rateLimit\.accountSnapshot/u,
    );
    assert.doesNotMatch(authRouteSource, /clearUnchangedLoginRateLimitBucket\(\s*"ip"/u);
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

  it("prunes only bounded tenant-scoped dormant sessions", async () => {
    const { pruneDormantSessions } = await import("../src/lib/auth.js");
    const tenantId = "10000000-0000-4000-8000-000000000001";
    const actorUserId = "20000000-0000-4000-8000-000000000001";
    let receivedValues: unknown[] = [];

    const deleted = await pruneDormantSessions(
      tenantId,
      actorUserId,
      30,
      200,
      async (sql, values) => {
        assert.match(sql, /WHERE tenant_id = \$1/u);
        assert.match(sql, /GREATEST\(expires_at, COALESCE\(revoked_at, expires_at\)\)/u);
        assert.match(sql, /LIMIT \$3/u);
        assert.match(sql, /session\.tenant_id = \$1/u);
        receivedValues = values;
        return { rows: [], rowCount: 2 };
      },
    );

    assert.equal(deleted, 2);
    assert.deepEqual(receivedValues, [tenantId, 30, 200]);
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
