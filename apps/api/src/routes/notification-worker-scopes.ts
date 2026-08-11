import type { FastifyInstance } from "fastify";
import { pool } from "@filo/database";
import { requireNotificationWorker } from "../lib/worker-auth.js";

type ScopeRow = {
  tenantId: string;
  actorUserId: string;
};

type ScopeQuery = (
  sql: string,
  values?: unknown[],
) => Promise<{ rows: ScopeRow[] }>;

export async function listNotificationWorkerScopes(query: ScopeQuery) {
  const result = await query(
    `SELECT DISTINCT ON (membership.tenant_id)
            membership.tenant_id AS "tenantId",
            membership.user_id AS "actorUserId"
     FROM memberships membership
     JOIN users actor ON actor.id = membership.user_id
     JOIN tenants tenant ON tenant.id = membership.tenant_id
     WHERE membership.role IN ('owner', 'admin', 'operator')
       AND actor.disabled_at IS NULL
     ORDER BY membership.tenant_id,
              CASE membership.role
                WHEN 'owner' THEN 0
                WHEN 'admin' THEN 1
                ELSE 2
              END,
              membership.created_at,
              membership.user_id
     LIMIT 500`,
  );
  return result.rows;
}

export async function notificationWorkerScopeRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireNotificationWorker }, async () => ({
    scopes: await listNotificationWorkerScopes(async (sql, values) => {
      const result = await pool.query<ScopeRow>(sql, values);
      return { rows: result.rows };
    }),
  }));
}
