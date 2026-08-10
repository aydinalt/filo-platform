import type { FastifyReply, FastifyRequest } from "fastify";
import type { SessionUser } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { readSessionToken } from "./session.js";

type SessionLookup = (
  sql: string,
  values: unknown[],
) => Promise<{ rows: SessionUser[] }>;

type SessionMaintenanceQuery = (
  sql: string,
  values: unknown[],
) => Promise<{ rowCount: number | null; rows: unknown[] }>;

export async function loadActiveSessionUser(
  userId: string,
  tenantId: string,
  sessionId: string,
  query?: SessionLookup,
): Promise<SessionUser | null> {
  const runQuery = query ?? ((sql: string, values: unknown[]) =>
    withTenantTransaction(tenantId, userId, (client) => client.query<SessionUser>(sql, values)));
  const result = await runQuery(
    `SELECT u.id, m.tenant_id AS "tenantId", t.name AS "tenantName",
            u.email, u.full_name AS "fullName", m.role
     FROM users u
     JOIN memberships m ON m.user_id = u.id
     JOIN tenants t ON t.id = m.tenant_id
     JOIN user_sessions s ON s.user_id = u.id AND s.tenant_id = m.tenant_id
     WHERE u.id = $1 AND m.tenant_id = $2 AND u.disabled_at IS NULL
       AND s.id = $3 AND s.revoked_at IS NULL AND s.expires_at > now()
     LIMIT 1`,
    [userId, tenantId, sessionId],
  );
  return result.rows[0] ?? null;
}

export async function revokeActiveSession(
  userId: string,
  tenantId: string,
  sessionId: string,
  query?: SessionLookup,
): Promise<void> {
  const runQuery = query ?? ((sql: string, values: unknown[]) =>
    withTenantTransaction(tenantId, userId, (client) => client.query<SessionUser>(sql, values)));
  await runQuery(
    `UPDATE user_sessions
     SET revoked_at = COALESCE(revoked_at, now())
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
    [sessionId, tenantId, userId],
  );
}

export async function pruneDormantSessions(
  tenantId: string,
  actorUserId: string,
  retentionDays: number,
  batchSize: number,
  query?: SessionMaintenanceQuery,
): Promise<number> {
  const runQuery = query ?? ((sql: string, values: unknown[]) =>
    withTenantTransaction(tenantId, actorUserId, (client) => client.query(sql, values)));
  const result = await runQuery(
    `WITH candidates AS (
       SELECT id
       FROM user_sessions
       WHERE tenant_id = $1
         AND GREATEST(expires_at, COALESCE(revoked_at, expires_at))
             < now() - ($2::integer * interval '1 day')
       ORDER BY GREATEST(expires_at, COALESCE(revoked_at, expires_at)), id
       LIMIT $3
     )
     DELETE FROM user_sessions AS session
     USING candidates
     WHERE session.id = candidates.id AND session.tenant_id = $1`,
    [tenantId, retentionDays, batchSize],
  );
  return result.rowCount ?? 0;
}

export async function requireSession(request: FastifyRequest, reply: FastifyReply) {
  const token = request.cookies.filo_session;
  if (!token) return reply.code(401).send({ error: "AUTH_REQUIRED" });
  let tokenUser: SessionUser;
  let sessionId: string;
  try {
    const claims = await readSessionToken(token);
    tokenUser = claims.user;
    sessionId = claims.sessionId;
  } catch {
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(401).send({ error: "INVALID_SESSION" });
  }

  const activeUser = await loadActiveSessionUser(tokenUser.id, tokenUser.tenantId, sessionId);
  if (!activeUser) {
    reply.clearCookie("filo_session", { path: "/" });
    return reply.code(401).send({ error: "INVALID_SESSION" });
  }
  request.sessionUser = activeUser;
  request.sessionId = sessionId;
}
