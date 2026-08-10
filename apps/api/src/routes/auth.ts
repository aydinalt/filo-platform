import type { FastifyInstance } from "fastify";
import { loginSchema, type SessionUser } from "@filo/contracts";
import { pool } from "@filo/database";
import { config } from "../config.js";
import { requireSession } from "../lib/auth.js";
import { verifyLoginPassword } from "../lib/login-security.js";
import { createSessionToken } from "../lib/session.js";

type LoginRow = SessionUser & { passwordHash: string; disabledAt: Date | null };

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
    const token = await createSessionToken(user);
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

  app.post("/logout", async (_request, reply) => {
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(204).send();
  });
}
