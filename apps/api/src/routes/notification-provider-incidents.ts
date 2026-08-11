import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import { notificationProviderIncidentParamsSchema, notificationProviderIncidentQuerySchema, updateNotificationProviderIncidentSchema, updateNotificationProviderIncidentScanSettingsSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { loadIncidentScanStatus, runNotificationProviderIncidentScan } from "../lib/notification-provider-incident-scan.js";

const guard = { preHandler: [requireSession, allow("owner", "admin", "operator")] };
const writeGuard = { preHandler: [requireSession, allow("owner", "admin")] };
const incidentSelect = `SELECT i.id,i.provider_profile_id AS "providerProfileId",p.name AS "providerName",p.channel,p.provider,i.issue_types AS "issueTypes",i.severity,i.status,i.occurrence_count AS "occurrenceCount",i.snapshot,i.opened_at AS "openedAt",i.last_detected_at AS "lastDetectedAt",i.last_checked_at AS "lastCheckedAt",i.healthy_scan_count AS "healthyScanCount",i.recovery_candidate_at AS "recoveryCandidateAt",i.acknowledged_at AS "acknowledgedAt",i.resolved_at AS "resolvedAt",i.resolution_notes AS "resolutionNotes" FROM notification_provider_incidents i JOIN notification_provider_profiles p ON p.id=i.provider_profile_id AND p.tenant_id=i.tenant_id`;
const shapeIncident = (row: Record<string, any>, events: Record<string, any>[] = []) => ({
  ...row,
  openedAt: row.openedAt.toISOString(),
  lastDetectedAt: row.lastDetectedAt.toISOString(),
  lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
  recoveryCandidateAt: row.recoveryCandidateAt?.toISOString() ?? null,
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
      const values: unknown[] = [user.tenantId];
      let where = "WHERE i.tenant_id=$1";
      if (parsed.data.status !== "all") {
        values.push(parsed.data.status);
        where += ` AND i.status=$${values.length}`;
      }
      const rows = (await client.query(`${incidentSelect} ${where} ORDER BY CASE i.status WHEN 'open' THEN 0 WHEN 'acknowledged' THEN 1 ELSE 2 END,i.last_detected_at DESC LIMIT 250`, values)).rows;
      const ids = rows.map(row => row.id);
      const events = ids.length ? (await client.query(`SELECT incident_id AS "incidentId",event_type AS "eventType",details,created_at AS "createdAt" FROM notification_provider_incident_events WHERE tenant_id=$1 AND incident_id=ANY($2::uuid[]) ORDER BY created_at`, [user.tenantId, ids])).rows : [];
      return { incidents: rows.map(row => shapeIncident(row, events.filter(event => event.incidentId === row.id))), scanStatus: await loadIncidentScanStatus(client) };
    });
  });

  app.post("/sync", guard, async (request, reply) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      const result = await runNotificationProviderIncidentScan(client, user.tenantId, user.id, `manual-${randomUUID()}`, "manual", true);
      return reply.code(202).send(result);
    });
  });

  app.put("/scan-settings", writeGuard, async (request, reply) => {
    const parsed = updateNotificationProviderIncidentScanSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_SCAN_SETTINGS" });
    const user = request.sessionUser, input = parsed.data;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      await client.query(`INSERT INTO notification_provider_incident_scan_settings(tenant_id,enabled,interval_minutes,recovery_confirmation_scans,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET enabled=EXCLUDED.enabled,interval_minutes=EXCLUDED.interval_minutes,recovery_confirmation_scans=EXCLUDED.recovery_confirmation_scans,updated_by=EXCLUDED.updated_by,updated_at=now()`, [user.tenantId, input.enabled, input.intervalMinutes, input.recoveryConfirmationScans, user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_provider_incident_scan.settings_updated','notification_provider_incident_scan_settings',$1,$3::jsonb)`, [user.tenantId, user.id, JSON.stringify(input)]);
      return reply.send({ scanStatus: await loadIncidentScanStatus(client) });
    });
  });

  app.patch("/:id", guard, async (request, reply) => {
    const route = notificationProviderIncidentParamsSchema.safeParse(request.params);
    const parsed = updateNotificationProviderIncidentSchema.safeParse(request.body);
    if (!route.success || !parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_INCIDENT_UPDATE" });
    const id = route.data.id;
    const user = request.sessionUser, input = parsed.data;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      const result = await client.query(`UPDATE notification_provider_incidents SET status=$3,acknowledged_at=COALESCE(acknowledged_at,now()),acknowledged_by=COALESCE(acknowledged_by,$4),resolved_at=CASE WHEN $3='resolved' THEN now() ELSE resolved_at END,resolved_by=CASE WHEN $3='resolved' THEN $4 ELSE resolved_by END,resolution_notes=CASE WHEN $3='resolved' THEN $5 ELSE resolution_notes END,updated_at=now() WHERE tenant_id=$1 AND id=$2 AND status<>$3 AND status<>'resolved' RETURNING id`, [user.tenantId, id, input.status, user.id, input.resolutionNotes]);
      if (!result.rowCount) return reply.code(404).send({ error: "ACTIVE_PROVIDER_INCIDENT_NOT_FOUND" });
      await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,$3,$4,jsonb_build_object('resolutionNotes',$5::text))`, [user.tenantId, id, input.status, user.id, input.resolutionNotes]);
      await client.query(`UPDATE in_app_notifications SET read_at=COALESCE(read_at,now()) WHERE tenant_id=$1 AND source_type='provider_incident' AND source_id=$2 AND ($3='resolved' OR recipient_user_id=$4)`, [user.tenantId, id, input.status, user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_provider_incident.status_changed','notification_provider_incident',$3,jsonb_build_object('status',$4))`, [user.tenantId, user.id, id, input.status]);
      return reply.code(204).send();
    });
  });
}
