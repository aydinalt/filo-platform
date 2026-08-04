import { withTenantTransaction } from "@filo/database";

type TenantClient = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

export async function loadNotificationProviderHealth(client: TenantClient, lookbackHours?: number) {
  const stored = (await client.query(`SELECT failure_rate_warning_percent AS "failureRateWarningPercent",queue_age_warning_seconds AS "queueAgeWarningSeconds",lookback_hours AS "lookbackHours" FROM notification_provider_health_settings`)).rows[0];
  const settings = {
    failureRateWarningPercent: stored?.failureRateWarningPercent ?? 10,
    queueAgeWarningSeconds: stored?.queueAgeWarningSeconds ?? 900,
    lookbackHours: lookbackHours ?? stored?.lookbackHours ?? 24
  };
  const providers = (await client.query(`SELECT p.id,p.name,p.channel,p.provider,p.status,count(o.id)::int AS "deliveryCount",count(o.id) FILTER (WHERE o.status IN ('failed','bounced','complained'))::int AS "failedCount",count(o.id) FILTER (WHERE o.status='delivered')::int AS "deliveredCount",max(o.delivered_at) AS "lastDeliveredAt",COALESCE(EXTRACT(EPOCH FROM (now()-min(o.available_at) FILTER (WHERE o.status IN ('pending','failed') AND o.available_at<=now())))::int,0) AS "oldestReadyAgeSeconds" FROM notification_provider_profiles p LEFT JOIN notification_delivery_outbox o ON o.provider_profile_id=p.id AND o.created_at>=now()-($1::int*interval '1 hour') GROUP BY p.id ORDER BY p.channel,p.name`, [settings.lookbackHours])).rows;
  return {
    settings,
    providers: providers.map(row => {
      const failureRatePercent = row.deliveryCount ? Math.round(row.failedCount * 100 / row.deliveryCount) : 0;
      const issues = [
        row.status !== "active" ? "inactive" : null,
        failureRatePercent >= settings.failureRateWarningPercent ? "failure_rate" : null,
        row.oldestReadyAgeSeconds >= settings.queueAgeWarningSeconds ? "queue_delay" : null
      ].filter((issue): issue is string => Boolean(issue));
      return {
        ...row,
        lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null,
        failureRatePercent,
        health: issues.length ? "warning" as const : "healthy" as const,
        issues
      };
    })
  };
}
