import { withTenantTransaction } from "@filo/database";
import { loadNotificationProviderHealth } from "./notification-provider-health.js";

type TenantClient = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];

export type IncidentScanSummary = {
  opened: number;
  refreshed: number;
  recoveryCandidates: number;
  healthy: number;
};

export async function loadIncidentScanStatus(client: TenantClient) {
  const row = (await client.query(`SELECT enabled,interval_minutes AS "intervalMinutes",recovery_confirmation_scans AS "recoveryConfirmationScans",last_scan_at AS "lastScanAt",last_scan_key AS "lastScanKey",last_summary AS "lastSummary" FROM notification_provider_incident_scan_settings`)).rows[0];
  const lastScanAt = row?.lastScanAt?.toISOString() ?? null;
  const intervalMinutes = row?.intervalMinutes ?? 5;
  return {
    enabled: row?.enabled ?? true,
    intervalMinutes,
    recoveryConfirmationScans: row?.recoveryConfirmationScans ?? 2,
    lastScanAt,
    nextDueAt: lastScanAt ? new Date(new Date(lastScanAt).getTime() + intervalMinutes * 60_000).toISOString() : null,
    lastScanKey: row?.lastScanKey ?? null,
    lastSummary: row?.lastSummary ?? null
  };
}

export async function runNotificationProviderIncidentScan(
  client: TenantClient,
  tenantId: string,
  actorUserId: string,
  scanKey: string,
  source: "manual" | "scheduler",
  force = false
) {
  const actor = await client.query(`SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`, [actorUserId, tenantId]);
  if (!actor.rowCount) return { skipped: true as const, reason: "invalid_actor" as const };

  const lock = (await client.query(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired`, [`notification-provider-scan:${tenantId}`])).rows[0];
  if (!lock?.acquired) return { skipped: true as const, reason: "scan_in_progress" as const };

  const settings = await loadIncidentScanStatus(client);
  if (!force && !settings.enabled) return { skipped: true as const, reason: "disabled" as const };
  if (!force && settings.nextDueAt && new Date(settings.nextDueAt).getTime() > Date.now()) {
    return { skipped: true as const, reason: "not_due" as const, nextDueAt: settings.nextDueAt };
  }

  const duplicate = await client.query(`SELECT 1 FROM notification_provider_incident_scan_runs WHERE scan_key=$1`, [scanKey]);
  if (duplicate.rowCount) return { skipped: true as const, reason: "duplicate" as const };

  const health = await loadNotificationProviderHealth(client);
  const summary: IncidentScanSummary = { opened: 0, refreshed: 0, recoveryCandidates: 0, healthy: 0 };

  for (const provider of health.providers) {
    const active = (await client.query(`SELECT id,recovery_candidate_at AS "recoveryCandidateAt",healthy_scan_count AS "healthyScanCount" FROM notification_provider_incidents WHERE provider_profile_id=$1 AND status IN ('open','acknowledged') FOR UPDATE`, [provider.id])).rows[0];
    if (provider.health === "warning") {
      const severity = provider.issues.includes("inactive") || provider.failureRatePercent >= health.settings.failureRateWarningPercent * 2 || provider.oldestReadyAgeSeconds >= health.settings.queueAgeWarningSeconds * 2 ? "critical" : "warning";
      if (active) {
        await client.query(`UPDATE notification_provider_incidents SET issue_types=$2,severity=$3,snapshot=$4::jsonb,occurrence_count=occurrence_count+1,last_detected_at=now(),last_checked_at=now(),healthy_scan_count=0,recovery_candidate_at=NULL,updated_at=now() WHERE id=$1`, [active.id, provider.issues, severity, JSON.stringify(provider)]);
        await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,'refreshed',$3,jsonb_build_object('issues',$4::text[],'severity',$5,'source',$6))`, [tenantId, active.id, actorUserId, provider.issues, severity, source]);
        if (active.recoveryCandidateAt) await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,'recovery_cleared',$3,jsonb_build_object('source',$4))`, [tenantId, active.id, actorUserId, source]);
        summary.refreshed++;
      } else {
        const created = (await client.query(`INSERT INTO notification_provider_incidents(tenant_id,provider_profile_id,issue_types,severity,snapshot,last_checked_at) VALUES($1,$2,$3,$4,$5::jsonb,now()) RETURNING id`, [tenantId, provider.id, provider.issues, severity, JSON.stringify(provider)])).rows[0];
        await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,'opened',$3,jsonb_build_object('issues',$4::text[],'severity',$5,'source',$6))`, [tenantId, created.id, actorUserId, provider.issues, severity, source]);
        summary.opened++;
      }
      continue;
    }

    summary.healthy++;
    if (!active) continue;
    const nextHealthyCount = active.healthyScanCount + 1;
    const becomesCandidate = !active.recoveryCandidateAt && nextHealthyCount >= settings.recoveryConfirmationScans;
    await client.query(`UPDATE notification_provider_incidents SET healthy_scan_count=$2,last_checked_at=now(),recovery_candidate_at=CASE WHEN $3 THEN now() ELSE recovery_candidate_at END,updated_at=now() WHERE id=$1`, [active.id, nextHealthyCount, becomesCandidate]);
    if (becomesCandidate) {
      await client.query(`INSERT INTO notification_provider_incident_events(tenant_id,incident_id,event_type,actor_user_id,details) VALUES($1,$2,'recovery_candidate',$3,jsonb_build_object('healthyScans',$4,'source',$5))`, [tenantId, active.id, actorUserId, nextHealthyCount, source]);
      summary.recoveryCandidates++;
    }
  }

  await client.query(`INSERT INTO notification_provider_incident_scan_runs(tenant_id,scan_key,actor_user_id,source,opened_count,refreshed_count,recovery_candidate_count,healthy_provider_count) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, [tenantId, scanKey, actorUserId, source, summary.opened, summary.refreshed, summary.recoveryCandidates, summary.healthy]);
  await client.query(`INSERT INTO notification_provider_incident_scan_settings(tenant_id,updated_by,last_scan_at,last_scan_key,last_summary) VALUES($1,$2,now(),$3,$4::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET last_scan_at=EXCLUDED.last_scan_at,last_scan_key=EXCLUDED.last_scan_key,last_summary=EXCLUDED.last_summary,updated_at=now()`, [tenantId, actorUserId, scanKey, JSON.stringify(summary)]);
  await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_provider_incidents.scanned','notification_provider_incident_scan',$1,$3::jsonb)`, [tenantId, actorUserId, JSON.stringify({ ...summary, source, scanKey })]);
  return { skipped: false as const, summary, scanStatus: await loadIncidentScanStatus(client) };
}
