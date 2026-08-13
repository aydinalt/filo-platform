import type { FastifyInstance } from "fastify";
import { updateMobileReleaseIncidentSchema, type MobileReleaseIncident } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type IncidentRow = Omit<MobileReleaseIncident, "firstObservedAt" | "lastObservedAt" | "acknowledgedAt" | "resolvedAt"> & {
  firstObservedAt: Date;
  lastObservedAt: Date;
  acknowledgedAt: Date | null;
  resolvedAt: Date | null;
};

function serializeIncident(row: IncidentRow): MobileReleaseIncident {
  return {
    ...row,
    firstObservedAt: row.firstObservedAt.toISOString(),
    lastObservedAt: row.lastObservedAt.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
    resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function mobileReleaseIncidentRoutes(app: FastifyInstance) {
  app.get("/release-incidents", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<IncidentRow>(
        `SELECT id, rollout_id AS "rolloutId", target_version AS "targetVersion", status,
                severity, occurrence_count AS "occurrenceCount", health_snapshot AS "healthSnapshot",
                first_observed_at AS "firstObservedAt", last_observed_at AS "lastObservedAt",
                acknowledged_at AS "acknowledgedAt", resolved_at AS "resolvedAt",
                resolution_notes AS "resolutionNotes"
         FROM mobile_release_incidents WHERE tenant_id = $1
         ORDER BY last_observed_at DESC LIMIT 100`,
        [user.tenantId],
      );
      return { incidents: result.rows.map(serializeIncident) };
    });
  });

  app.patch("/release-incidents/:id", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const incidentId = (request.params as { id?: string }).id ?? "";
    const parsed = updateMobileReleaseIncidentSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(incidentId) || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_INCIDENT_UPDATE" });
    }
    const user = request.sessionUser;
    const updated = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = parsed.data.status === "acknowledged"
        ? await client.query<{ rolloutId: string }>(
          `UPDATE mobile_release_incidents
           SET status = 'acknowledged', acknowledged_by = $3, acknowledged_at = now()
           WHERE tenant_id = $1 AND id = $2 AND status = 'open'
           RETURNING rollout_id AS "rolloutId"`,
          [user.tenantId, incidentId, user.id],
        )
        : await client.query<{ rolloutId: string }>(
          `UPDATE mobile_release_incidents
           SET status = 'resolved', resolved_by = $3, resolved_at = now(), resolution_notes = $4
           WHERE tenant_id = $1 AND id = $2 AND status IN ('open','acknowledged')
           RETURNING rollout_id AS "rolloutId"`,
          [user.tenantId, incidentId, user.id, parsed.data.notes],
        );
      if (!result.rows[0]) return false;
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.release_incident_' || $3,'mobile_release_incident',$4,
                jsonb_build_object('rolloutId',$5,'notes',$6))`,
        [user.tenantId, user.id, parsed.data.status, incidentId, result.rows[0].rolloutId, parsed.data.notes],
      );
      return true;
    });
    return updated ? reply.code(204).send() : reply.code(404).send({ error: "ACTIVE_MOBILE_RELEASE_INCIDENT_NOT_FOUND" });
  });
}
