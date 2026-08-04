import type { FastifyInstance } from "fastify";
import { notificationProviderHealthQuerySchema, updateNotificationProviderHealthSettingsSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const readGuard = { preHandler: [requireSession, allow("owner", "admin", "operator")] };
const writeGuard = { preHandler: [requireSession, allow("owner", "admin")] };

export async function notificationProviderHealthRoutes(app: FastifyInstance) {
  app.get("/", readGuard, async (request, reply) => {
    const parsed = notificationProviderHealthQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_HEALTH_QUERY" });
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      const stored = (await client.query(`SELECT failure_rate_warning_percent AS "failureRateWarningPercent",queue_age_warning_seconds AS "queueAgeWarningSeconds",lookback_hours AS "lookbackHours" FROM notification_provider_health_settings`)).rows[0];
      const settings = { failureRateWarningPercent: stored?.failureRateWarningPercent ?? 10, queueAgeWarningSeconds: stored?.queueAgeWarningSeconds ?? 900, lookbackHours: parsed.data.lookbackHours ?? stored?.lookbackHours ?? 24 };
      const providers = (await client.query(`SELECT p.id,p.name,p.channel,p.provider,p.status,count(o.id)::int AS "deliveryCount",count(o.id) FILTER (WHERE o.status IN ('failed','bounced','complained'))::int AS "failedCount",count(o.id) FILTER (WHERE o.status='delivered')::int AS "deliveredCount",max(o.delivered_at) AS "lastDeliveredAt",COALESCE(EXTRACT(EPOCH FROM (now()-min(o.available_at) FILTER (WHERE o.status IN ('pending','failed') AND o.available_at<=now())))::int,0) AS "oldestReadyAgeSeconds" FROM notification_provider_profiles p LEFT JOIN notification_delivery_outbox o ON o.provider_profile_id=p.id AND o.created_at>=now()-($1::int*interval '1 hour') GROUP BY p.id ORDER BY p.channel,p.name`, [settings.lookbackHours])).rows;
      return { settings, providers: providers.map(row => { const failureRatePercent = row.deliveryCount ? Math.round(row.failedCount * 100 / row.deliveryCount) : 0; const issues = [row.status !== "active" ? "inactive" : null, failureRatePercent >= settings.failureRateWarningPercent ? "failure_rate" : null, row.oldestReadyAgeSeconds >= settings.queueAgeWarningSeconds ? "queue_delay" : null].filter(Boolean); return { ...row, lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null, failureRatePercent, health: issues.length ? "warning" : "healthy", issues }; }) };
    });
  });

  app.put("/settings", writeGuard, async (request, reply) => {
    const parsed = updateNotificationProviderHealthSettingsSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_HEALTH_SETTINGS" });
    const user = request.sessionUser, input = parsed.data;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      await client.query(`INSERT INTO notification_provider_health_settings(tenant_id,failure_rate_warning_percent,queue_age_warning_seconds,lookback_hours,updated_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(tenant_id) DO UPDATE SET failure_rate_warning_percent=EXCLUDED.failure_rate_warning_percent,queue_age_warning_seconds=EXCLUDED.queue_age_warning_seconds,lookback_hours=EXCLUDED.lookback_hours,updated_by=EXCLUDED.updated_by,updated_at=now()`, [user.tenantId,input.failureRateWarningPercent,input.queueAgeWarningSeconds,input.lookbackHours,user.id]);
      await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_provider_health.settings_updated','notification_provider_health',$1,$3::jsonb)`, [user.tenantId,user.id,JSON.stringify(input)]);
      return reply.code(204).send();
    });
  });
}
