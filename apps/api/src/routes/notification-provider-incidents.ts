import type { FastifyInstance } from "fastify";
import { notificationProviderIncidentQuerySchema, updateNotificationProviderIncidentSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { loadNotificationProviderHealth } from "../lib/notification-provider-health.js";

const guard = { preHandler: [requireSession, allow("owner", "admin", "operator")] };
const incidentSelect = `SELECT i.id,i.provider_profile_id AS "providerProfileId",p.name AS "providerName",p.channel,p.provider,i.issue_types AS "issueTypes",i.severity,i.status,i.occurrence_count AS "occurrenceCount",i.snapshot,i.opened_at AS "openedAt",i.last_detected_at AS "lastDetectedAt",i.acknowledged_at AS "acknowledgedAt",i.resolved_at AS "resolvedAt",i.resolution_notes AS "resolutionNotes" FROM notification_provider_incidents i JOIN notification_provider_profiles p ON p.id=i.provider_profile_id`;
const shapeIncident = (row: Record<string, any>, events: Record<string, any>[] = []) => ({
  ...row,
  openedAt: row.openedAt.toISOString(),
  lastDetectedAt: row.lastDetectedAt.toISOString(),
  acknowledgedAt: row.acknowledgedAt?.toISOString() ?? null,
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  events: events.map(event => ({ ...event, createdAt: event.createdAt.toISOString() }))
});

export async function notificationProviderIncidentRoutes(app: FastifyInstance) {
  app.get("/", guard, async (request, reply) => {
    const parsed = notificationProviderIncidentQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_INCIDENT_QUERY" });
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      const where = parsed.data.status === "all" ? "" : "WHERE i.status=$1";
      const values = parsed.data.status === "all" ? [] : [parsed.data.status];
      const rows = (await client.query(`${incidentSelect} ${where} ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,i.last_detected_at DESC LIMIT 250`, values)).rows;
      const ids = rows.map(row => row.id);
      const events = ids.length ? (await client.query(`SELECT incident_id AS "incidentId",event_type AS "eventType",details,created_at AS "createdAt" FROM notification_provider_incident_events WHERE incident_id=ANY($1::uuid[]) ORDER BY created_at`, [ids])).rows : [];
      return { incidents: rows.map(row => shapeIncident(row, events.filter(event => event.incidentId === row.id))) };
    });
  });

  app.post("/sync", guard, async (request, reply) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      const health = await loadNotificationProviderHealth(client);
      let opened = 0, refreshed = 0;
      for (const provider of health.providers.filter(item => item.health === "warning")) {
        const severity = provider.issues.includes("inactive") || provider.failureRatePercent >= health.settings.failureRateWarningPercent * 2 || provider.oldestReadyAgeSeconds >= health.settings.queueAgeWarningSeconds * 2 ? "critical" : "warning";
        const result = (await client.query(`INSERT INTO notification_provider_incidents(tenant_id,provider_profile_id,issue_types,severity,snapshot) VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(tenant_id,provider_profile_id) WHERE status IN ('open','acknowledged') DO UPDATE SET issue_types=EXCLUDED.issue_types,severity=EXCLUDED.severity,snapshot=EXCLUDED.snapshot,occurrence_count=notification_provider_incidents.occurrence_count+1,last_detected_at=now(),updated_at=now() RETURNING id,(xmax=0) AS inserted`, [user.tenantId, provider.id, provider.issues, severity, JSON.stringify(provider)])).rows[0];
        await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,$3,$4,jsonb_build_object('issues',$5::text[],'severity',$6))`, [user.tenantId, result.id, result.inserted ? "opened" : "refreshed", user.id, provider.issues, severity]);
        result.inserted ? opened++ : refreshed++;
      }
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_provider_incidents.synced','notification_provider_incidents',$1,jsonb_build_object('opened',$3,'refreshed',$4))`, [user.tenantId, user.id, opened, refreshed]);
      return reply.code(202).send({ opened, refreshed, healthy: health.providers.filter(item => item.health === "healthy").length });
    });
  });

  app.patch("/:id", guard, async (request, reply) => {
    const parsed = updateNotificationProviderIncidentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_INCIDENT_UPDATE" });
    const { id } = request.params as { id: string };
    const user = request.sessionUser, input = parsed.data;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      const result = await client.query(`UPDATE notification_provider_incidents SET status=$2,acknowledged_at=COALESCE(acknowledged_at,now()),acknowledged_by=COALESCE(acknowledged_by,$3),resolved_at=CASE WHEN $2='resolved' THEN now() ELSE resolved_at END,resolved_by=CASE WHEN $2='resolved' THEN $3 ELSE resolved_by END,resolution_notes=CASE WHEN $2='resolved' THEN $4 ELSE resolution_notes END,updated_at=now() WHERE id=$1 AND status<>$2 AND status<>'resolved' RETURNING id`, [id, input.status, user.id, input.resolutionNotes]);
      if (!result.rowCount) return reply.code(404).send({ error: "ACTIVE_PROVIDER_INCIDENT_NOT_FOUND" });
      await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,$3,$4,jsonb_build_object('resolutionNotes',$5::text))`, [user.tenantId, id, input.status, user.id, input.resolutionNotes]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_provider_incident.status_changed','notification_provider_incident',$3,jsonb_build_object('status',$4))`, [user.tenantId, user.id, id, input.status]);
      return reply.code(204).send();
    });
  });
}
