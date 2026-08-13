import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import {
  approveMobilePilotReleaseSchema,
  revokeMobilePilotReleaseSchema,
  type MobilePilotCohortDevice,
  type MobilePilotCohortReadiness,
  type MobilePilotReleaseApproval,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import { assessMobilePilotCohort } from "../lib/mobile-pilot-cohort.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

type ApprovalRow = Omit<MobilePilotReleaseApproval, "approvedAt" | "revokedAt"> & {
  approvedAt: Date;
  revokedAt: Date | null;
};

function serializeApproval(row: ApprovalRow): MobilePilotReleaseApproval {
  return {
    ...row,
    approvedAt: row.approvedAt.toISOString(),
    revokedAt: row.revokedAt?.toISOString() ?? null,
  };
}

async function readEligibleDevices(client: PoolClient, tenantId: string) {
  const result = await client.query<Omit<MobilePilotCohortDevice, "completedAt"> & { completedAt: Date }>(
    `SELECT run.id AS "runId", credential.platform,
            run.qualified_device_manufacturer AS "deviceManufacturer",
            run.qualified_device_model AS "deviceModel",
            run.qualified_app_version AS "appVersion",
            run.completed_at AS "completedAt"
     FROM mobile_pilot_runs run
     JOIN mobile_access_credentials credential
       ON credential.id = run.credential_id AND credential.tenant_id = run.tenant_id
     WHERE run.tenant_id = $1 AND run.status = 'passed'
       AND run.qualified_app_version IS NOT NULL
       AND run.qualified_device_manufacturer IS NOT NULL
       AND run.qualified_device_model IS NOT NULL
     ORDER BY run.completed_at DESC`,
    [tenantId],
  );
  return result.rows.map((row) => ({ ...row, completedAt: row.completedAt.toISOString() }));
}

async function readApprovals(client: PoolClient, tenantId: string) {
  const result = await client.query<ApprovalRow>(
    `SELECT id, target_version AS "targetVersion", status, notes,
            readiness_snapshot AS snapshot, approved_at AS "approvedAt",
            revoked_at AS "revokedAt", revoke_reason AS "revokeReason"
     FROM mobile_pilot_release_approvals
     WHERE tenant_id = $1
     ORDER BY approved_at DESC LIMIT 50`,
    [tenantId],
  );
  return result.rows.map(serializeApproval);
}

async function readApproval(client: PoolClient, tenantId: string, approvalId: string) {
  const result = await client.query<ApprovalRow>(
    `SELECT id, target_version AS "targetVersion", status, notes,
            readiness_snapshot AS snapshot, approved_at AS "approvedAt",
            revoked_at AS "revokedAt", revoke_reason AS "revokeReason"
     FROM mobile_pilot_release_approvals
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, approvalId],
  );
  return result.rows[0] ? serializeApproval(result.rows[0]) : null;
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function mobilePilotReleaseRoutes(app: FastifyInstance) {
  app.get("/pilot-release", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const version = String((request.query as { version?: string }).version ?? "");
    if (!VERSION_PATTERN.test(version)) return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_VERSION" });
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => {
      const [devices, approvals] = await Promise.all([
        readEligibleDevices(client, user.tenantId),
        readApprovals(client, user.tenantId),
      ]);
      return { readiness: assessMobilePilotCohort(version, devices), approvals };
    });
  });

  app.post("/pilot-release/approve", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed = approveMobilePilotReleaseSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_APPROVAL" });
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('mobile-pilot-release:' || $1 || ':' || $2))`,
        [user.tenantId, parsed.data.targetVersion],
      );
      const readiness = assessMobilePilotCohort(
        parsed.data.targetVersion,
        await readEligibleDevices(client, user.tenantId),
      );
      if (!readiness.ready) return { approval: null, readiness, conflict: false };
      const inserted = await client.query<ApprovalRow>(
        `INSERT INTO mobile_pilot_release_approvals(
           tenant_id, target_version, notes, readiness_snapshot, approved_by
         ) VALUES($1,$2,$3,$4::jsonb,$5)
         ON CONFLICT (tenant_id, target_version) WHERE status = 'approved' DO NOTHING
         RETURNING id, target_version AS "targetVersion", status, notes,
                   readiness_snapshot AS snapshot, approved_at AS "approvedAt",
                   revoked_at AS "revokedAt", revoke_reason AS "revokeReason"`,
        [user.tenantId, parsed.data.targetVersion, parsed.data.notes, JSON.stringify(readiness), user.id],
      );
      const approval = inserted.rows[0];
      if (!approval) return { approval: null, readiness, conflict: true };
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.pilot_release_approved','mobile_pilot_release',$3,
                jsonb_build_object('targetVersion',$4,'iosPassed',$5,'androidPassed',$6,
                                   'distinctAndroidModels',$7))`,
        [
          user.tenantId, user.id, approval.id, parsed.data.targetVersion,
          readiness.iosPassed, readiness.androidPassed, readiness.distinctAndroidModels,
        ],
      );
      return { approval: serializeApproval(approval), readiness, conflict: false };
    });
    if (!result.approval) {
      return reply.code(409).send({
        error: result.conflict ? "MOBILE_RELEASE_ALREADY_APPROVED" : "MOBILE_PILOT_COHORT_INCOMPLETE",
        readiness: result.readiness,
      });
    }
    return reply.code(201).send({ approval: result.approval, readiness: result.readiness });
  });

  app.post("/pilot-release/:id/revoke", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const approvalId = (request.params as { id?: string }).id ?? "";
    const parsed = revokeMobilePilotReleaseSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(approvalId) || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_REVOCATION" });
    }
    const user = request.sessionUser;
    const revoked = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<{ targetVersion: string }>(
        `UPDATE mobile_pilot_release_approvals
         SET status = 'revoked', revoked_by = $3, revoked_at = now(), revoke_reason = $4
         WHERE tenant_id = $1 AND id = $2 AND status = 'approved'
         RETURNING target_version AS "targetVersion"`,
        [user.tenantId, approvalId, user.id, parsed.data.reason],
      );
      const row = result.rows[0];
      if (!row) return false;
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.pilot_release_revoked','mobile_pilot_release',$3,
                jsonb_build_object('targetVersion',$4,'reason',$5))`,
        [user.tenantId, user.id, approvalId, row.targetVersion, parsed.data.reason],
      );
      return true;
    });
    return revoked ? reply.code(204).send() : reply.code(404).send({ error: "ACTIVE_MOBILE_RELEASE_APPROVAL_NOT_FOUND" });
  });

  app.get("/pilot-release/:id/report.csv", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const approvalId = (request.params as { id?: string }).id ?? "";
    if (!UUID_PATTERN.test(approvalId)) return reply.code(400).send({ error: "INVALID_MOBILE_RELEASE_APPROVAL" });
    const user = request.sessionUser;
    const approval = await withTenantTransaction(user.tenantId, user.id, (client) =>
      readApproval(client, user.tenantId, approvalId));
    if (!approval) return reply.code(404).send({ error: "MOBILE_RELEASE_APPROVAL_NOT_FOUND" });
    const rows = [
      ["approval_id", "version", "status", "approved_at", "platform", "manufacturer", "model", "pilot_run", "completed_at"],
      ...approval.snapshot.devices.map((device) => [
        approval.id, approval.targetVersion, approval.status, approval.approvedAt,
        device.platform, device.deviceManufacturer, device.deviceModel, device.runId, device.completedAt,
      ]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    return reply.header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="mobile-release-${approval.targetVersion}.csv"`)
      .send(csv);
  });
}
