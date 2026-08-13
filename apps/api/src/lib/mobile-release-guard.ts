import type { PoolClient } from "pg";
import type { MobileReleaseRolloutEvent, MobileReleaseRolloutHealth } from "@filo/contracts";
import { classifyMobileDeviceHealth, type MobileHealthSignals } from "./mobile-device-health.js";
import {
  assessMobileReleaseRollout,
  assignMobileRolloutDevices,
  type RolloutDeviceInput,
} from "./mobile-release-rollout.js";

type GuardRolloutRow = {
  id: string;
  targetVersion: string;
  status: "active" | "paused";
  targetPercentage: 10 | 25 | 50 | 100;
  maxUnhealthyPercent: number;
  guardMode: "manual" | "auto_pause" | "auto_rollback";
  rollbackAfterBreaches: number;
  consecutiveBreaches: number;
  guardPausedAt: Date | null;
};

type GuardDeviceRow = Omit<RolloutDeviceInput, "health"> & MobileHealthSignals;

export function decideMobileReleaseGuard(input: {
  healthy: boolean;
  status: "active" | "paused";
  guardMode: "manual" | "auto_pause" | "auto_rollback";
  nextBreaches: number;
  rollbackAfterBreaches: number;
}): "healthy" | "record" | "pause" | "rollback" {
  if (input.healthy) return "healthy";
  if (input.guardMode === "auto_rollback" && input.status === "paused"
      && input.nextBreaches >= input.rollbackAfterBreaches) return "rollback";
  if (input.status === "active" && input.guardMode !== "manual") return "pause";
  return "record";
}

async function readGuardDevices(client: PoolClient, tenantId: string): Promise<RolloutDeviceInput[]> {
  const result = await client.query<GuardDeviceRow>(
    `SELECT credential.id AS "credentialId", credential.device_name AS "deviceName",
            credential.platform, credential.device_manufacturer AS "deviceManufacturer",
            credential.device_model AS "deviceModel", credential.app_version AS "appVersion",
            credential.last_heartbeat_at AS "lastHeartbeatAt", credential.permission_state AS permission,
            credential.mobile_tracking_state AS "trackingState",
            credential.pending_location_count AS "pendingLocationCount",
            credential.oldest_queued_at AS "oldestQueuedAt", credential.last_error_code AS "lastErrorCode"
     FROM mobile_access_credentials credential
     JOIN vehicle_driver_assignments assignment
       ON assignment.id = credential.assignment_id AND assignment.tenant_id = credential.tenant_id
      AND assignment.ended_at IS NULL
     WHERE credential.tenant_id = $1 AND credential.revoked_at IS NULL
       AND credential.expires_at > now()
     ORDER BY credential.id`,
    [tenantId],
  );
  const now = new Date();
  return result.rows.map((row) => ({
    credentialId: row.credentialId,
    deviceName: row.deviceName,
    platform: row.platform,
    deviceManufacturer: row.deviceManufacturer,
    deviceModel: row.deviceModel,
    appVersion: row.appVersion,
    health: classifyMobileDeviceHealth(row, now),
  }));
}

async function addGuardEvent(
  client: PoolClient,
  tenantId: string,
  actorUserId: string,
  rollout: GuardRolloutRow,
  action: Extract<MobileReleaseRolloutEvent["action"], "guard_recovered" | "auto_paused" | "auto_rolled_back">,
  reason: string,
  health: MobileReleaseRolloutHealth,
) {
  await client.query(
    `INSERT INTO mobile_release_rollout_events(
       tenant_id, rollout_id, action, from_percentage, to_percentage,
       reason, health_snapshot, actor_user_id
     ) VALUES($1,$2,$3,$4,$4,$5,$6::jsonb,$7)`,
    [tenantId, rollout.id, action, rollout.targetPercentage, reason, JSON.stringify(health), actorUserId],
  );
  await client.query(
    `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
     VALUES($1,$2,'mobile.release_rollout_' || $3,'mobile_release_rollout',$4,
            jsonb_build_object('targetVersion',$5,'targetPercentage',$6,
                               'unhealthyPercent',$7,'reason',$8))`,
    [tenantId, actorUserId, action, rollout.id, rollout.targetVersion,
      rollout.targetPercentage, health.unhealthyPercent, reason],
  );
}

async function recordIncident(
  client: PoolClient,
  tenantId: string,
  rollout: GuardRolloutRow,
  severity: "warning" | "critical",
  health: MobileReleaseRolloutHealth,
) {
  await client.query(
    `INSERT INTO mobile_release_incidents(
       tenant_id, rollout_id, target_version, severity, health_snapshot
     ) VALUES($1,$2,$3,$4,$5::jsonb)
     ON CONFLICT (tenant_id, rollout_id) WHERE status IN ('open','acknowledged')
     DO UPDATE SET severity = EXCLUDED.severity,
                   occurrence_count = mobile_release_incidents.occurrence_count + 1,
                   health_snapshot = EXCLUDED.health_snapshot,
                   last_observed_at = now()`,
    [tenantId, rollout.id, rollout.targetVersion, severity, JSON.stringify(health)],
  );
}

export async function runMobileReleaseGuard(
  client: PoolClient,
  tenantId: string,
  actorUserId: string,
  runKey: string,
) {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext('mobile-release-guard:' || $1 || ':' || $2))`, [tenantId, runKey]);
  const replay = await client.query<{ summary: { evaluated: number; breaches: number; autoPaused: number; autoRolledBack: number } }>(
    `SELECT summary FROM mobile_release_guard_runs WHERE tenant_id = $1 AND run_key = $2`,
    [tenantId, runKey],
  );
  if (replay.rows[0]) return { skipped: true, ...replay.rows[0].summary };

  const rolloutResult = await client.query<GuardRolloutRow>(
    `SELECT id, target_version AS "targetVersion", status,
            target_percentage AS "targetPercentage", max_unhealthy_percent AS "maxUnhealthyPercent",
            guard_mode AS "guardMode", rollback_after_breaches AS "rollbackAfterBreaches",
            consecutive_breaches AS "consecutiveBreaches", guard_paused_at AS "guardPausedAt"
     FROM mobile_release_rollouts
     WHERE tenant_id = $1
       AND (status = 'active' OR (status = 'paused' AND guard_paused_at IS NOT NULL AND guard_mode = 'auto_rollback'))
     ORDER BY created_at FOR UPDATE`,
    [tenantId],
  );
  const rawDevices = await readGuardDevices(client, tenantId);
  const summary = { evaluated: 0, breaches: 0, autoPaused: 0, autoRolledBack: 0 };
  for (const rollout of rolloutResult.rows) {
    summary.evaluated += 1;
    const devices = assignMobileRolloutDevices(rawDevices, rollout.targetPercentage);
    const health = assessMobileReleaseRollout(rollout.targetVersion, rollout.maxUnhealthyPercent, devices);
    const nextBreaches = rollout.consecutiveBreaches + 1;
    const decision = decideMobileReleaseGuard({
      healthy: health.readyToAdvance,
      status: rollout.status,
      guardMode: rollout.guardMode,
      nextBreaches,
      rollbackAfterBreaches: rollout.rollbackAfterBreaches,
    });
    if (decision === "healthy") {
      if (rollout.consecutiveBreaches > 0) {
        await addGuardEvent(client, tenantId, actorUserId, rollout, "guard_recovered",
          "Otomatik koruma sağlık sinyallerinin eşik içine döndüğünü doğruladı.", health);
      }
      await client.query(
        `UPDATE mobile_release_rollouts SET consecutive_breaches = 0, last_guard_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, rollout.id],
      );
      continue;
    }

    summary.breaches += 1;
    const critical = decision === "rollback";
    await recordIncident(client, tenantId, rollout, critical ? "critical" : "warning", health);

    if (decision === "rollback") {
      await client.query(
        `UPDATE mobile_release_rollouts
         SET status = 'rolled_back', consecutive_breaches = $3, last_guard_at = now(), completed_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, rollout.id, nextBreaches],
      );
      await addGuardEvent(client, tenantId, actorUserId, rollout, "auto_rolled_back",
        `${nextBreaches} ardışık sağlık ihlali sonrası otomatik geri alma.`, health);
      summary.autoRolledBack += 1;
    } else if (decision === "pause") {
      await client.query(
        `UPDATE mobile_release_rollouts
         SET status = 'paused', consecutive_breaches = $3, last_guard_at = now(), guard_paused_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, rollout.id, nextBreaches],
      );
      await addGuardEvent(client, tenantId, actorUserId, rollout, "auto_paused",
        "Rollout sağlık kapısı ihlal edildiği için otomatik duraklatıldı.", health);
      summary.autoPaused += 1;
    } else {
      await client.query(
        `UPDATE mobile_release_rollouts
         SET consecutive_breaches = $3, last_guard_at = now()
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, rollout.id, nextBreaches],
      );
    }
  }

  await client.query(
    `INSERT INTO mobile_release_guard_runs(tenant_id, run_key, summary) VALUES($1,$2,$3::jsonb)`,
    [tenantId, runKey, JSON.stringify(summary)],
  );
  return { skipped: false, ...summary };
}
