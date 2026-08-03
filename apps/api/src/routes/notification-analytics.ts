import type { FastifyInstance } from "fastify";
import { notificationAnalyticsQuerySchema } from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

export async function notificationAnalyticsRoutes(app: FastifyInstance) {
  app.get("/", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const parsed = notificationAnalyticsQuerySchema.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_NOTIFICATION_ANALYTICS_QUERY" });
    const { days } = parsed.data;
    return withTenantTransaction(request.sessionUser.tenantId, request.sessionUser.id, async client => {
      const summary = (await client.query(`SELECT count(*)::int AS total,count(*) FILTER (WHERE status='delivered')::int AS delivered,count(*) FILTER (WHERE status='failed')::int AS failed,count(*) FILTER (WHERE status='cancelled')::int AS cancelled,count(*) FILTER (WHERE status IN ('pending','processing'))::int AS queued,COALESCE(round(avg(EXTRACT(EPOCH FROM (delivered_at-created_at))) FILTER (WHERE delivered_at IS NOT NULL))::int,0) AS "averageDeliverySeconds",COALESCE(EXTRACT(EPOCH FROM (now()-(min(available_at) FILTER (WHERE status IN ('pending','failed') AND available_at<=now()))))::int,0) AS "oldestReadyAgeSeconds" FROM notification_delivery_outbox WHERE created_at>=now()-($1::int*interval '1 day')`, [days])).rows[0];
      const breakdown = (await client.query(`SELECT o.channel,COALESCE(p.provider,'unassigned') AS provider,o.status,count(*)::int AS count FROM notification_delivery_outbox o LEFT JOIN notification_provider_profiles p ON p.id=o.provider_profile_id WHERE o.created_at>=now()-($1::int*interval '1 day') GROUP BY o.channel,COALESCE(p.provider,'unassigned'),o.status ORDER BY o.channel,provider,o.status`, [days])).rows;
      const events = (await client.query(`SELECT count(*) FILTER (WHERE event_type='bounced')::int AS bounced,count(*) FILTER (WHERE event_type='complained')::int AS complained FROM notification_provider_events WHERE occurred_at>=now()-($1::int*interval '1 day')`, [days])).rows[0];
      const suppressions = (await client.query(`SELECT count(*) FILTER (WHERE active)::int AS active,count(*) FILTER (WHERE active AND reason='hard_bounce')::int AS "hardBounce",count(*) FILTER (WHERE active AND reason='complaint')::int AS complaints,count(*) FILTER (WHERE active AND reason='manual')::int AS manual FROM notification_suppressions`)).rows[0];
      return { analytics: { rangeDays: days, summary, events, suppressions, breakdown } };
    });
  });
}
