import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import {
  changePasswordSchema,
  completePasswordResetSchema,
  loginSchema,
  requestPasswordResetSchema,
  type AccountSession,
  type SessionUser,
} from "@filo/contracts";
import { pool, withTenantTransaction } from "@filo/database";
import { config } from "../config.js";
import { pruneDormantSessions, requireSession, revokeActiveSession } from "../lib/auth.js";
import { verifyLoginPassword } from "../lib/login-security.js";
import {
  clearUnchangedLoginRateLimitBucket,
  consumePersistentLoginAttempt,
} from "../lib/login-rate-limit.js";
import { createSessionToken, readSessionToken } from "../lib/session.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import {
  createPasswordResetSecret,
  hashPasswordResetSecret,
  parsePasswordResetToken,
} from "../lib/password-reset-token.js";

type LoginRow = SessionUser & { passwordHash: string; disabledAt: Date | null };
type SessionRow = Omit<AccountSession, "current" | "createdAt" | "expiresAt"> & {
  createdAt: Date;
  expiresAt: Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export async function authRoutes(app: FastifyInstance) {
  app.post("/login", {
    config: {
      rateLimit: {
        max: config.authLoginRateLimitMax,
        timeWindow: config.authLoginRateLimitWindowMs,
      },
    },
  }, async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const rateLimit = await consumePersistentLoginAttempt(request.ip, parsed.data.email);
    if (rateLimit.limited) {
      reply.header("retry-after", String(rateLimit.retryAfter));
      return reply.code(429).send({ error: "RATE_LIMITED" });
    }

    const result = await pool.query<LoginRow>(
      `SELECT u.id, m.tenant_id AS "tenantId", t.name AS "tenantName",
              u.email, u.full_name AS "fullName",
              m.role, u.password_hash AS "passwordHash", u.disabled_at AS "disabledAt"
       FROM users u
       JOIN memberships m ON m.user_id = u.id
       JOIN tenants t ON t.id = m.tenant_id
       WHERE u.email = $1
       ORDER BY m.created_at ASC
       LIMIT 1`,
      [parsed.data.email]
    );
    const row = result.rows[0];
    const passwordValid = verifyLoginPassword(parsed.data.password, row?.passwordHash);
    if (!row || row.disabledAt || !passwordValid) {
      return reply.code(401).send({ error: "INVALID_CREDENTIALS" });
    }

    const user: SessionUser = {
      id: row.id,
      tenantId: row.tenantId,
      tenantName: row.tenantName,
      email: row.email,
      fullName: row.fullName,
      role: row.role
    };
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1000);
    await withTenantTransaction(user.tenantId, user.id, async (client) => {
      await pruneDormantSessions(
        user.tenantId,
        user.id,
        config.sessionRecordRetentionDays,
        config.sessionCleanupBatchSize,
        (sql, values) => client.query(sql, values),
      );
      await client.query(
        `INSERT INTO user_sessions (id, tenant_id, user_id, expires_at)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, user.tenantId, user.id, expiresAt],
      );
      await clearUnchangedLoginRateLimitBucket(
        "account",
        parsed.data.email,
        rateLimit.accountSnapshot,
        (sql, values) => client.query(sql, values),
      );
    });
    const token = await createSessionToken(user, sessionId);
    reply.setCookie("filo_session", token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: "lax",
      path: "/",
      maxAge: config.sessionTtlHours * 60 * 60
    });
    return { user };
  });

  app.get("/me", { preHandler: requireSession }, async (request) => ({ user: request.sessionUser }));

  app.post("/password-reset/request", {
    config: { rateLimit: { max: 3, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const startedAt = Date.now();
    const parsed = requestPasswordResetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });

    const secret = createPasswordResetSecret();
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
    const tokenHash = hashPasswordResetSecret(secret);
    const candidate = await pool.query<{ tenantId: string }>(
      `SELECT membership.tenant_id AS "tenantId"
       FROM users
       JOIN memberships membership ON membership.user_id = users.id
       WHERE users.email = $1 AND users.disabled_at IS NULL
       ORDER BY membership.created_at
       LIMIT 1`,
      [parsed.data.email],
    );
    const tenantId = candidate.rows[0]?.tenantId ?? randomUUID();
    const token = `${tenantId}.${secret}`;
    const resetUrl = `${config.webOrigin}/?reset=${encodeURIComponent(token)}`;
    await pool.query(
      `SELECT request_password_reset($1,$2,$3,$4)`,
      [parsed.data.email, tokenHash, resetUrl, expiresAt],
    );
    await delay(Math.max(0, 300 - (Date.now() - startedAt)));
    return reply.code(202).send({ accepted: true });
  });

  app.post("/password-reset/complete", {
    config: { rateLimit: { max: 10, timeWindow: "1 hour" } },
  }, async (request, reply) => {
    const parsed = completePasswordResetSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const token = parsePasswordResetToken(parsed.data.token)!;
    const result = await pool.query<{ completed: boolean }>(
      `SELECT complete_password_reset($1,$2,$3) AS completed`,
      [token.tenantId, hashPasswordResetSecret(token.secret), hashPassword(parsed.data.password)],
    );
    if (!result.rows[0]?.completed) {
      return reply.code(410).send({ error: "PASSWORD_RESET_INVALID" });
    }
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(204).send();
  });

  app.post("/password/change", { preHandler: requireSession }, async (request, reply) => {
    const parsed = changePasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const user = request.sessionUser;
    const changed = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const current = await client.query<{ passwordHash: string }>(
        `SELECT password_hash AS "passwordHash" FROM users WHERE id = $1 FOR UPDATE`,
        [user.id],
      );
      if (!current.rows[0] || !verifyPassword(parsed.data.currentPassword, current.rows[0].passwordHash)) {
        return false;
      }
      await client.query(`UPDATE users SET password_hash = $2 WHERE id = $1`, [
        user.id,
        hashPassword(parsed.data.newPassword),
      ]);
      await client.query(
        `UPDATE user_sessions
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE tenant_id = $1 AND user_id = $2 AND id <> $3 AND revoked_at IS NULL`,
        [user.tenantId, user.id, request.sessionId],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
         VALUES($1,$2,'account.password_changed','user',$2)`,
        [user.tenantId, user.id],
      );
      return true;
    });
    if (!changed) return reply.code(401).send({ error: "CURRENT_PASSWORD_INVALID" });
    return reply.code(204).send();
  });

  app.get("/sessions", { preHandler: requireSession }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<SessionRow>(
        `SELECT id, created_at AS "createdAt", expires_at AS "expiresAt"
         FROM user_sessions
         WHERE tenant_id = $1 AND user_id = $2
           AND revoked_at IS NULL AND expires_at > now()
         ORDER BY created_at DESC
         LIMIT 20`,
        [user.tenantId, user.id],
      );
      return {
        sessions: result.rows.map((row) => ({
          id: row.id,
          current: row.id === request.sessionId,
          createdAt: new Date(row.createdAt).toISOString(),
          expiresAt: new Date(row.expiresAt).toISOString(),
        })),
      };
    });
  });

  app.delete("/sessions/:sessionId", { preHandler: requireSession }, async (request, reply) => {
    const target = (request.params as { sessionId?: string }).sessionId ?? "";
    if (!UUID_PATTERN.test(target) || target === request.sessionId) {
      return reply.code(400).send({ error: "INVALID_INPUT" });
    }
    const user = request.sessionUser;
    const revoked = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query(
        `UPDATE user_sessions SET revoked_at = now()
         WHERE id = $1 AND tenant_id = $2 AND user_id = $3
           AND revoked_at IS NULL AND expires_at > now()
         RETURNING id`,
        [target, user.tenantId, user.id],
      );
      if (!result.rows[0]) return false;
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
         VALUES($1,$2,'account.session_revoked','user_session',$3)`,
        [user.tenantId, user.id, target],
      );
      return true;
    });
    return revoked
      ? reply.code(204).send()
      : reply.code(404).send({ error: "SESSION_NOT_FOUND" });
  });

  app.post("/logout", async (request, reply) => {
    const token = request.cookies.filo_session;
    if (token) {
      let claims: Awaited<ReturnType<typeof readSessionToken>> | undefined;
      try {
        claims = await readSessionToken(token);
      } catch {
        claims = undefined;
      }
      if (claims) {
        await revokeActiveSession(claims.user.id, claims.user.tenantId, claims.sessionId);
      }
    }
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(204).send();
  });
}
