import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "@filo/contracts";
import { pool } from "@filo/database";
import { readSessionToken } from "./session.js";

type SessionLookup = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: SessionUser[] }>;

const databaseSessionLookup: SessionLookup = async (sql, values) =>
  pool.query<SessionUser>(sql, values);

export async function loadActiveSessionUser(
  userId: string,
  tenantId: string,
  query: SessionLookup = databaseSessionLookup,
): Promise<SessionUser | null> {
  const result = await query(
    `SELECT u.id, m.tenant_id AS "tenantId", t.name AS "tenantName",
            u.email, u.full_name AS "fullName", m.role
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     JOIN tenants t ON t.id = m.tenant_id
     WHERE u.id = $1 AND m.tenant_id = $2 AND u.disabled_at IS NULL
     LIMIT 1`,
    [userId, tenantId],
  );
  return result.rows[0] ?? null;
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.filo_session;
  if (!token) return reply.code(401).send({ error: "AUTH_REQUIRED" });
  let tokenUser: SessionUser;
  try {
    tokenUser = await readSessionToken(token);
  } catch {
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(401).send({ error: "INVALID_SESSION" });
  }

  const activeUser = await loadActiveSessionUser(tokenUser.id, tokenUser.tenantId);
  if (!activeUser) {
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(401).send({ error: "INVALID_SESSION" });
  }
  request.sessionUser = activeUser;
}
