import type { FastifyInstance } from "fastify";
import { randomUUID } from "node:crypto";
import {
  claimMobileEnrollmentSchema,
  createMobileEnrollmentSchema,
  mobileHeartbeatSchema,
  mobileLocationBatchSchema,
  mobileTrackingStateSchema,
  type MobileDeviceStatus,
  type MobileEnrollment,
  type MobilePrincipal,
} from "@filo/contracts";
import { pool, withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { ingestLocationEvent } from "../lib/location-ingestion.js";
import { requireMobileCredential } from "../lib/mobile-auth.js";
import { createMobileSecret, hashMobileSecret, parseMobileToken } from "../lib/mobile-token.js";
import { classifyMobileDeviceHealth } from "../lib/mobile-device-health.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type EnrollmentRow = Omit<MobileEnrollment, "expiresAt" | "claimedAt" | "revokedAt" | "createdAt"> & {
  expiresAt: Date;
  claimedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
};

type PrincipalRow = Omit<MobilePrincipal, "expiresAt"> & { expiresAt: Date };

type MobileDeviceStatusRow = Omit<
  MobileDeviceStatus,
  "health" | "oldestQueuedAt" | "lastHeartbeatAt" | "lastSyncAt" | "lastLocationAt"
> & {
  oldestQueuedAt: Date | null;
  lastHeartbeatAt: Date | null;
  lastSyncAt: Date | null;
  lastLocationAt: Date | null;
};

function serializeEnrollment(row: EnrollmentRow): MobileEnrollment {
  return {
    ...row,
    expiresAt: row.expiresAt.toISOString(),
    claimedAt: row.claimedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function mobileRoutes(app: FastifyInstance) {
  app.get("/devices/status", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<MobileDeviceStatusRow>(
        `SELECT credential.id AS "credentialId", credential.assignment_id AS "assignmentId",
                vehicle.plate AS "vehiclePlate", driver.full_name AS "driverName",
                credential.device_name AS "deviceName", credential.platform,
                credential.app_version AS "appVersion", credential.os_version AS "osVersion",
                credential.battery_percent AS "batteryPercent", credential.low_power_mode AS "lowPowerMode",
                credential.network_type AS "networkType", credential.permission_state AS permission,
                credential.mobile_tracking_state AS "trackingState",
                credential.pending_location_count AS "pendingLocationCount",
                credential.oldest_queued_at AS "oldestQueuedAt",
                credential.last_error_code AS "lastErrorCode",
                credential.last_heartbeat_at AS "lastHeartbeatAt",
                credential.last_sync_at AS "lastSyncAt",
                credential.last_location_at AS "lastLocationAt"
         FROM mobile_access_credentials credential
         JOIN vehicle_driver_assignments assignment ON assignment.id = credential.assignment_id
           AND assignment.tenant_id = credential.tenant_id AND assignment.ended_at IS NULL
         JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id AND vehicle.tenant_id = credential.tenant_id
         JOIN drivers driver ON driver.id = assignment.driver_id AND driver.tenant_id = credential.tenant_id
         WHERE credential.tenant_id = $1 AND credential.revoked_at IS NULL
           AND credential.expires_at > now()
         ORDER BY credential.created_at DESC LIMIT 100`,
        [user.tenantId],
      );
      const devices: MobileDeviceStatus[] = result.rows.map((row) => ({
        ...row,
        health: classifyMobileDeviceHealth(row),
        oldestQueuedAt: row.oldestQueuedAt?.toISOString() ?? null,
        lastHeartbeatAt: row.lastHeartbeatAt?.toISOString() ?? null,
        lastSyncAt: row.lastSyncAt?.toISOString() ?? null,
        lastLocationAt: row.lastLocationAt?.toISOString() ?? null,
      }));
      return { devices, serverTime: new Date().toISOString() };
    });
  });

  app.get("/enrollments", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<EnrollmentRow>(
        `SELECT enrollment.id, enrollment.assignment_id AS "assignmentId",
                vehicle.plate AS "vehiclePlate", driver.full_name AS "driverName",
                enrollment.label, enrollment.expires_at AS "expiresAt",
                enrollment.claimed_at AS "claimedAt", enrollment.revoked_at AS "revokedAt",
                enrollment.created_at AS "createdAt"
         FROM mobile_enrollments enrollment
         JOIN vehicle_driver_assignments assignment ON assignment.id = enrollment.assignment_id
           AND assignment.tenant_id = enrollment.tenant_id
         JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id
         JOIN drivers driver ON driver.id = assignment.driver_id
         WHERE enrollment.tenant_id = $1
         ORDER BY enrollment.created_at DESC LIMIT 100`,
        [user.tenantId],
      );
      return { enrollments: result.rows.map(serializeEnrollment) };
    });
  });

  app.post("/enrollments", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const parsed = createMobileEnrollmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const user = request.sessionUser;
    const secret = createMobileSecret();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const assignment = await client.query(
        `SELECT 1 FROM vehicle_driver_assignments
         WHERE id = $1 AND tenant_id = $2 AND ended_at IS NULL`,
        [parsed.data.assignmentId, user.tenantId],
      );
      if (!assignment.rowCount) return null;
      await client.query(
        `UPDATE mobile_enrollments SET revoked_at = COALESCE(revoked_at, now())
         WHERE tenant_id = $1 AND assignment_id = $2
           AND claimed_at IS NULL AND revoked_at IS NULL`,
        [user.tenantId, parsed.data.assignmentId],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO mobile_enrollments(
           tenant_id, assignment_id, label, token_hash, issued_by, expires_at
         ) VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [user.tenantId, parsed.data.assignmentId, parsed.data.label, hashMobileSecret(secret), user.id, expiresAt],
      );
      const id = inserted.rows[0]!.id;
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.enrollment_created','mobile_enrollment',$3,
                jsonb_build_object('assignmentId',$4,'expiresAt',$5))`,
        [user.tenantId, user.id, id, parsed.data.assignmentId, expiresAt],
      );
      return id;
    });
    if (!result) return reply.code(404).send({ error: "ACTIVE_ASSIGNMENT_NOT_FOUND" });
    return reply.code(201).send({
      enrollment: { id: result, assignmentId: parsed.data.assignmentId, label: parsed.data.label, expiresAt: expiresAt.toISOString() },
      token: `${result}.${secret}`,
    });
  });

  app.delete("/enrollments/:id", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const id = (request.params as { id?: string }).id ?? "";
    if (!UUID_PATTERN.test(id)) return reply.code(400).send({ error: "INVALID_INPUT" });
    const user = request.sessionUser;
    const revoked = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<{ assignmentId: string }>(
        `UPDATE mobile_enrollments SET revoked_at = COALESCE(revoked_at, now())
         WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
         RETURNING assignment_id AS "assignmentId"`,
        [id, user.tenantId],
      );
      const enrollment = result.rows[0];
      if (!enrollment) return false;
      await client.query(
        `UPDATE mobile_access_credentials SET revoked_at = COALESCE(revoked_at, now())
         WHERE tenant_id = $1 AND enrollment_id = $2 AND revoked_at IS NULL`,
        [user.tenantId, id],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id)
         VALUES($1,$2,'mobile.enrollment_revoked','mobile_enrollment',$3)`,
        [user.tenantId, user.id, id],
      );
      return true;
    });
    return revoked ? reply.code(204).send() : reply.code(404).send({ error: "MOBILE_ENROLLMENT_NOT_FOUND" });
  });

  app.post("/claim", { config: { rateLimit: { max: 10, timeWindow: "1 hour" } } }, async (request, reply) => {
    const parsed = claimMobileEnrollmentSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const enrollment = parseMobileToken(parsed.data.token)!;
    const credentialId = randomUUID();
    const credentialSecret = createMobileSecret();
    const result = await pool.query<PrincipalRow>(
      `SELECT credential_id AS "credentialId", tenant_id AS "tenantId",
              actor_user_id AS "actorUserId", assignment_id AS "assignmentId",
              vehicle_plate AS "vehiclePlate", driver_name AS "driverName",
              device_name AS "deviceName", platform, expires_at AS "expiresAt"
       FROM claim_mobile_enrollment($1,$2,$3,$4,$5,$6)`,
      [
        enrollment.id, hashMobileSecret(enrollment.secret), credentialId,
        hashMobileSecret(credentialSecret), parsed.data.platform, parsed.data.deviceName,
      ],
    );
    const principal = result.rows[0];
    if (!principal) return reply.code(410).send({ error: "MOBILE_ENROLLMENT_INVALID" });
    return reply.code(201).send({
      credential: `${credentialId}.${credentialSecret}`,
      principal: { ...principal, expiresAt: principal.expiresAt.toISOString() },
    });
  });

  app.get("/me", { preHandler: requireMobileCredential }, async (request) => ({
    principal: request.mobilePrincipal,
  }));

  app.post("/heartbeat", { preHandler: requireMobileCredential }, async (request, reply) => {
    const parsed = mobileHeartbeatSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_MOBILE_HEARTBEAT" });
    const principal = request.mobilePrincipal;
    const heartbeatAt = new Date();
    await withTenantTransaction(principal.tenantId, principal.actorUserId, async (client) => {
      await client.query(
        `UPDATE mobile_access_credentials
         SET app_version = $3, os_version = $4, battery_percent = $5,
             low_power_mode = $6, network_type = $7, permission_state = $8,
             mobile_tracking_state = $9, pending_location_count = $10,
             oldest_queued_at = $11, last_error_code = $12,
             last_heartbeat_at = $13
         WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL`,
        [
          principal.tenantId, principal.credentialId, parsed.data.appVersion,
          parsed.data.osVersion, parsed.data.batteryPercent, parsed.data.lowPowerMode,
          parsed.data.networkType, parsed.data.permission, parsed.data.trackingState,
          parsed.data.pendingLocationCount, parsed.data.oldestQueuedAt,
          parsed.data.lastErrorCode, heartbeatAt,
        ],
      );
    });
    return reply.code(202).send({ accepted: true, serverTime: heartbeatAt.toISOString() });
  });

  app.post("/shift/start", { preHandler: requireMobileCredential }, async (request, reply) => {
    const principal = request.mobilePrincipal;
    const result = await withTenantTransaction(principal.tenantId, principal.actorUserId, async (client) => {
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM work_shifts
         WHERE tenant_id = $1 AND assignment_id = $2 AND status = 'active'`,
        [principal.tenantId, principal.assignmentId],
      );
      if (existing.rows[0]) return { id: existing.rows[0].id, existing: true };
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO work_shifts(tenant_id,assignment_id,started_by)
         VALUES($1,$2,$3) RETURNING id`,
        [principal.tenantId, principal.assignmentId, principal.actorUserId],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.shift_started','shift',$3,jsonb_build_object('credentialId',$4))`,
        [principal.tenantId, principal.actorUserId, inserted.rows[0]!.id, principal.credentialId],
      );
      return { id: inserted.rows[0]!.id, existing: false };
    });
    return reply.code(result.existing ? 200 : 201).send({ shift: result });
  });

  app.post("/shift/end", { preHandler: requireMobileCredential }, async (request, reply) => {
    const principal = request.mobilePrincipal;
    const ended = await withTenantTransaction(principal.tenantId, principal.actorUserId, async (client) => {
      const result = await client.query<{ id: string }>(
        `UPDATE work_shifts SET status = 'completed', ended_at = now(), ended_by = $3
         WHERE tenant_id = $1 AND assignment_id = $2 AND status = 'active'
         RETURNING id`,
        [principal.tenantId, principal.assignmentId, principal.actorUserId],
      );
      if (!result.rows[0]) return false;
      await client.query(
        `UPDATE tracking_statuses SET state = 'off', updated_at = now(), updated_by = $3
         WHERE tenant_id = $1 AND assignment_id = $2`,
        [principal.tenantId, principal.assignmentId, principal.actorUserId],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.shift_ended','shift',$3,jsonb_build_object('credentialId',$4))`,
        [principal.tenantId, principal.actorUserId, result.rows[0].id, principal.credentialId],
      );
      return true;
    });
    return ended ? reply.code(204).send() : reply.code(404).send({ error: "ACTIVE_SHIFT_NOT_FOUND" });
  });

  app.patch("/tracking", { preHandler: requireMobileCredential }, async (request, reply) => {
    const parsed = mobileTrackingStateSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_INPUT" });
    const principal = request.mobilePrincipal;
    const state = parsed.data.permission === "granted_always" ? parsed.data.state : "permission_revoked";
    const changed = await withTenantTransaction(principal.tenantId, principal.actorUserId, async (client) => {
      if (state === "tracking") {
        const activeShift = await client.query(
          `SELECT 1 FROM work_shifts
           WHERE tenant_id = $1 AND assignment_id = $2 AND status = 'active'`,
          [principal.tenantId, principal.assignmentId],
        );
        if (!activeShift.rowCount) return false;
      }
      await client.query(
        `UPDATE tracking_statuses
         SET permission = $3, state = $4, error_code = $5, updated_at = now(), updated_by = $6
         WHERE tenant_id = $1 AND assignment_id = $2`,
        [
          principal.tenantId, principal.assignmentId, parsed.data.permission,
          state, parsed.data.errorCode ?? null, principal.actorUserId,
        ],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.tracking_changed','assignment',$3,
                jsonb_build_object('state',$4,'permission',$5,'credentialId',$6))`,
        [principal.tenantId, principal.actorUserId, principal.assignmentId, state, parsed.data.permission, principal.credentialId],
      );
      return true;
    });
    return changed
      ? { tracking: { assignmentId: principal.assignmentId, permission: parsed.data.permission, state } }
      : reply.code(409).send({ error: "ACTIVE_SHIFT_REQUIRED" });
  });

  app.post("/locations/batch", { preHandler: requireMobileCredential }, async (request, reply) => {
    const parsed = mobileLocationBatchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_LOCATION_BATCH" });
    const now = Date.now();
    if (parsed.data.events.some((event) => {
      const timestamp = new Date(event.recordedAt).getTime();
      return timestamp > now + 5 * 60 * 1000 || timestamp < now - 24 * 60 * 60 * 1000;
    })) return reply.code(400).send({ error: "LOCATION_TIME_OUT_OF_RANGE" });

    const principal = request.mobilePrincipal;
    const events = [...parsed.data.events].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
    const summary = await withTenantTransaction(principal.tenantId, principal.actorUserId, async (client) => {
      let created = 0;
      let duplicate = 0;
      for (const event of events) {
        const result = await ingestLocationEvent(client, principal.tenantId, {
          ...event,
          assignmentId: principal.assignmentId,
        });
        if (result === "inactive") return null;
        if (result === "created") created += 1;
        if (result === "duplicate") duplicate += 1;
      }
      await client.query(
        `UPDATE mobile_access_credentials
         SET last_sync_at = now(), last_location_at = $3,
             pending_location_count = GREATEST(0, pending_location_count - $4),
             oldest_queued_at = CASE
               WHEN pending_location_count - $4 <= 0 THEN NULL
               ELSE oldest_queued_at
             END
         WHERE tenant_id = $1 AND id = $2 AND revoked_at IS NULL`,
        [principal.tenantId, principal.credentialId, events.at(-1)!.recordedAt, events.length],
      );
      return { accepted: events.length, created, duplicate };
    });
    return summary
      ? reply.code(summary.created > 0 ? 201 : 200).send(summary)
      : reply.code(409).send({ error: "TRACKING_NOT_ACTIVE" });
  });
}
