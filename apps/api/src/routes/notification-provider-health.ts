import type { FastifyInstance } from "fastify";
import { notificationProviderHealthQuerySchema, updateNotificationProviderHealthSettingsSchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { loadNotificationProviderHealth } from "../lib/notification-provider-health.js";

const readGuard = { preHandler: [requireSession, allow("owner", "admin", "operator")] };
const writeGuard = { preHandler: [requireSession, allow("owner", "admin")] };

export async function notificationProviderHealthRoutes(app: FastifyInstance) {
  app.get("/", readGuard, async (request, reply) => {
    const parsed = notificationProviderHealthQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PROVIDER_HEALTH_QUERY" });
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async client => {
      return loadNotificationProviderHealth(client, parsed.data.lookbackHours);
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
