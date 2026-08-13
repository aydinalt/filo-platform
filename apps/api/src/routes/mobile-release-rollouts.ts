import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import {
  createMobileReleaseRolloutSchema,
  mobileReleaseRolloutActionSchema,
  type MobileReleaseRollout,
  type MobileReleaseRolloutEvent,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { classifyMobileDeviceHealth, type MobileHealthSignals } from "../lib/mobile-device-health.js";
import {
  assessMobileReleaseRollout,
  assignMobileRolloutDevices,
  type RolloutDeviceInput,
} from "../lib/mobile-release-rollout.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const STAGES = [10, 25, 50, 100] as const;

type RolloutRow = Omit<MobileReleaseRollout, "createdAt" | "startedAt" | "completedAt" | "health" | "devices" | "events"> & {
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

type EventRow = Omit<MobileReleaseRolloutEvent, "createdAt"> & { rolloutId: string; createdAt: Date };
type DeviceRow = Omit<RolloutDeviceInput, "health"> & MobileHealthSignals;

async function readRolloutDevices(client: PoolClient, tenantId: string): Promise<RolloutDeviceInput[]> {
  const result = await client.query<DeviceRow>(
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

async function readRollouts(client: PoolClient, tenantId: string): Promise<MobileReleaseRollout[]> {
  const [rolloutResult, eventResult, rawDevices] = await Promise.all([
    client.query<RolloutRow>(
      `SELECT id, approval_id AS "approvalId", target_version AS "targetVersion",
              previous_stable_version AS "previousStableVersion", status,
              target_percentage AS "targetPercentage", max_unhealthy_percent AS "maxUnhealthyPercent",
              notes, created_at AS "createdAt", started_at AS "startedAt", completed_at AS "completedAt"
       FROM mobile_release_rollouts WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT 20`,
      [tenantId],
    ),
    client.query<EventRow>(
      `SELECT id, rollout_id AS "rolloutId", action, from_percentage AS "fromPercentage",
              to_percentage AS "toPercentage", reason, health_snapshot AS "healthSnapshot",
              created_at AS "createdAt"
       FROM mobile_release_rollout_events WHERE tenant_id = $1
       ORDER BY created_at DESC LIMIT 200`,
      [tenantId],
    ),
    readRolloutDevices(client, tenantId),
  ]);
  return rolloutResult.rows.map((row) => {
    const devices = assignMobileRolloutDevices(rawDevices, row.targetPercentage);
    return {
      ...row,
      createdAt: row.createdAt.toISOString(),
      startedAt: row.startedAt?.toISOString() ?? null,
      completedAt: row.completedAt?.toISOString() ?? null,
      health: assessMobileReleaseRollout(row.targetVersion, row.maxUnhealthyPercent, devices),
      devices,
      events: eventResult.rows.filter((event) => event.rolloutId === row.id).map(({ rolloutId: _rolloutId, ...event }) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    };
  });
}

async function hasActiveApproval(client: PoolClient, tenantId: string, approvalId: string, targetVersion: string) {
  const result = await client.query(
    `SELECT 1 FROM mobile_pilot_release_approvals
     WHERE tenant_id = $1 AND id = $2 AND target_version = $3 AND status = 'approved'`,
    [tenantId, approvalId, targetVersion],
  );
  return result.rowCount === 1;
}

async function addEvent(
  client: PoolClient,
  tenantId: string,
  userId: string,
  rolloutId: string,
  action: MobileReleaseRolloutEvent["action"],
  fromPercentage: number | null,
  toPercentage: number | null,
  reason: string,
  healthSnapshot: MobileReleaseRollout["health"],
) {
  await client.query(
    `INSERT INTO mobile_release_rollout_events(
       tenant_id, rollout_id, action, from_percentage, to_percentage,
       reason, health_snapshot, actor_user_id
     ) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,
    [tenantId, rolloutId, action, fromPercentage, toPercentage, reason, JSON.stringify(healthSnapshot), userId],
  );
}

export async function mobileReleaseRolloutRoutes(app: FastifyInstance) {
  app.get("/release-rollouts", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => ({
      rollouts: await readRollouts(client, user.tenantId),
    }));
  });

  app.post("/release-rollouts", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed = createMobileReleaseRolloutSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_ROLLOUT" });
    const user = request.sessionUser;
    const created = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('mobile-release-rollout:' || $1 || ':' || $2))`, [user.tenantId, parsed.data.targetVersion]);
      const approval = await client.query<{ id: string }>(
        `SELECT id FROM mobile_pilot_release_approvals
         WHERE tenant_id = $1 AND target_version = $2 AND status = 'approved'`,
        [user.tenantId, parsed.data.targetVersion],
      );
      if (!approval.rows[0]) return { error: "ACTIVE_MOBILE_RELEASE_APPROVAL_REQUIRED" as const };
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO mobile_release_rollouts(
           tenant_id, approval_id, target_version, previous_stable_version,
           max_unhealthy_percent, notes, created_by
         ) VALUES($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (tenant_id, target_version) DO NOTHING RETURNING id`,
        [user.tenantId, approval.rows[0].id, parsed.data.targetVersion, parsed.data.previousStableVersion,
          parsed.data.maxUnhealthyPercent, parsed.data.notes, user.id],
      );
      if (!inserted.rows[0]) return { error: "MOBILE_RELEASE_ROLLOUT_EXISTS" as const };
      const devices = assignMobileRolloutDevices(await readRolloutDevices(client, user.tenantId), 10);
      const health = assessMobileReleaseRollout(parsed.data.targetVersion, parsed.data.maxUnhealthyPercent, devices);
      await addEvent(client, user.tenantId, user.id, inserted.rows[0].id, "created", null, 10, parsed.data.notes, health);
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.release_rollout_created','mobile_release_rollout',$3,
                jsonb_build_object('targetVersion',$4,'previousStableVersion',$5,'targetPercentage',10))`,
        [user.tenantId, user.id, inserted.rows[0].id, parsed.data.targetVersion, parsed.data.previousStableVersion],
      );
      return { id: inserted.rows[0].id };
    });
    if ("error" in created) return reply.code(409).send({ error: created.error });
    const rollout = await withTenantTransaction(user.tenantId, user.id, async (client) =>
      (await readRollouts(client, user.tenantId)).find((item) => item.id === created.id));
    return reply.code(201).send({ rollout });
  });

  app.post("/release-rollouts/:id/actions", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const rolloutId = (request.params as { id?: string }).id ?? "";
    const parsed = mobileReleaseRolloutActionSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(rolloutId) || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_ROLLOUT_ACTION" });
    }
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const locked = await client.query<RolloutRow>(
        `SELECT id, approval_id AS "approvalId", target_version AS "targetVersion",
                previous_stable_version AS "previousStableVersion", status,
                target_percentage AS "targetPercentage", max_unhealthy_percent AS "maxUnhealthyPercent",
                notes, created_at AS "createdAt", started_at AS "startedAt", completed_at AS "completedAt"
         FROM mobile_release_rollouts WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [user.tenantId, rolloutId],
      );
      const rollout = locked.rows[0];
      if (!rollout) return { error: "MOBILE_RELEASE_ROLLOUT_NOT_FOUND" as const };
      const devices = assignMobileRolloutDevices(await readRolloutDevices(client, user.tenantId), rollout.targetPercentage);
      const health = assessMobileReleaseRollout(rollout.targetVersion, rollout.maxUnhealthyPercent, devices);
      const action = parsed.data.action;
      const approvalRequired = ["start", "advance", "resume", "complete"].includes(action);
      if (approvalRequired && !await hasActiveApproval(client, user.tenantId, rollout.approvalId, rollout.targetVersion)) {
        return { error: "ACTIVE_MOBILE_RELEASE_APPROVAL_REQUIRED" as const, health };
      }

      let nextStatus = rollout.status;
      let nextPercentage = rollout.targetPercentage;
      let eventAction: MobileReleaseRolloutEvent["action"];
      if (action === "start" && rollout.status === "draft") {
        nextStatus = "active"; eventAction = "started";
      } else if (action === "advance" && rollout.status === "active") {
        const currentIndex = STAGES.indexOf(rollout.targetPercentage);
        if (!health.readyToAdvance) return { error: "MOBILE_RELEASE_ROLLOUT_HEALTH_GATE_FAILED" as const, health };
        if (STAGES[currentIndex + 1] !== parsed.data.targetPercentage) {
          return { error: "MOBILE_RELEASE_ROLLOUT_STAGE_ORDER_INVALID" as const, health };
        }
        nextPercentage = parsed.data.targetPercentage; eventAction = "advanced";
      } else if (action === "pause" && rollout.status === "active") {
        nextStatus = "paused"; eventAction = "paused";
      } else if (action === "resume" && rollout.status === "paused") {
        nextStatus = "active"; eventAction = "resumed";
      } else if (action === "complete" && rollout.status === "active" && rollout.targetPercentage === 100) {
        if (!health.readyToAdvance) return { error: "MOBILE_RELEASE_ROLLOUT_HEALTH_GATE_FAILED" as const, health };
        nextStatus = "completed"; eventAction = "completed";
      } else if (action === "rollback" && ["active", "paused", "completed"].includes(rollout.status)) {
        nextStatus = "rolled_back"; eventAction = "rolled_back";
      } else {
        return { error: "MOBILE_RELEASE_ROLLOUT_TRANSITION_INVALID" as const, health };
      }

      await client.query(
        `UPDATE mobile_release_rollouts
         SET status = $3, target_percentage = $4,
             started_at = CASE WHEN $3 = 'active' AND started_at IS NULL THEN now() ELSE started_at END,
             completed_at = CASE WHEN $3 IN ('completed','rolled_back') THEN now() ELSE NULL END
         WHERE tenant_id = $1 AND id = $2`,
        [user.tenantId, rolloutId, nextStatus, nextPercentage],
      );
      await addEvent(client, user.tenantId, user.id, rolloutId, eventAction,
        rollout.targetPercentage, nextPercentage, parsed.data.reason, health);
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.release_rollout_' || $3,'mobile_release_rollout',$4,
                jsonb_build_object('targetVersion',$5,'fromPercentage',$6,'toPercentage',$7,'reason',$8))`,
        [user.tenantId, user.id, eventAction, rolloutId, rollout.targetVersion,
          rollout.targetPercentage, nextPercentage, parsed.data.reason],
      );
      return { success: true as const };
    });
    if ("error" in result) {
      const status = result.error === "MOBILE_RELEASE_ROLLOUT_NOT_FOUND" ? 404 : 409;
      return reply.code(status).send({ error: result.error, health: "health" in result ? result.health : undefined });
    }
    const rollout = await withTenantTransaction(user.tenantId, user.id, async (client) =>
      (await readRollouts(client, user.tenantId)).find((item) => item.id === rolloutId));
    return { rollout };
  });
}
