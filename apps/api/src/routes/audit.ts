import type { FastifyInstance } from "fastify";
import type { AuditEvent } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";

type AuditRow = Omit<AuditEvent, "id" | "createdAt"> & {
  id: string | number;
  createdAt: Date;
};

export async function auditRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: requireSession }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<AuditRow>(
        `SELECT a.id, a.action, a.entity_type AS "entityType", a.entity_id AS "entityId",
                COALESCE(u.full_name, 'Sistem') AS "actorName", a.metadata,
                a.created_at AS "createdAt"
         FROM audit_events a
         LEFT JOIN users u ON u.id = a.actor_user_id
         ORDER BY a.created_at DESC
         LIMIT 20`
      );
      return {
        events: result.rows.map((row) => ({
          ...row,
          id: String(row.id),
          createdAt: row.createdAt.toISOString()
        }))
      };
    });
  });
}
