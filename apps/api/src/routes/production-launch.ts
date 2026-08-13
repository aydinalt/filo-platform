import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import {
  activateProductionLaunchSchema,
  productionLaunchActionSchema,
  type ProductionLaunch,
  type ProductionLaunchCertificate,
  type ProductionLaunchEvent,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type LaunchRow = Omit<ProductionLaunch, "certificate" | "events" | "activatedAt" | "statusUpdatedAt"> & {
  certificate: ProductionLaunchCertificate;
  activatedAt: Date;
  statusUpdatedAt: Date;
};
type EventRow = Omit<ProductionLaunchEvent, "createdAt"> & { createdAt: Date };

async function readEvents(client: PoolClient, tenantId: string, launchId: string) {
  const result = await client.query<EventRow>(
    `SELECT id, action, reason, created_at AS "createdAt"
     FROM production_launch_events
     WHERE tenant_id = $1 AND launch_id = $2
     ORDER BY created_at DESC LIMIT 100`,
    [tenantId, launchId],
  );
  return result.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}

async function readLaunches(client: PoolClient, tenantId: string) {
  const result = await client.query<LaunchRow>(
    `SELECT id, readiness_review_id AS "readinessReviewId", target_version AS "targetVersion",
            status, certificate_snapshot AS certificate, certificate_sha256 AS "certificateSha256",
            notes, status_reason AS "statusReason", activated_at AS "activatedAt",
            status_updated_at AS "statusUpdatedAt"
     FROM production_launches
     WHERE tenant_id = $1 ORDER BY activated_at DESC LIMIT 20`,
    [tenantId],
  );
  return Promise.all(result.rows.map(async (row): Promise<ProductionLaunch> => ({
    ...row,
    activatedAt: row.activatedAt.toISOString(),
    statusUpdatedAt: row.statusUpdatedAt.toISOString(),
    events: await readEvents(client, tenantId, row.id),
  })));
}

async function liveGateReady(client: PoolClient, tenantId: string, targetVersion: string) {
  const result = await client.query<{ ready: boolean }>(
    `SELECT
       EXISTS(
         SELECT 1 FROM mobile_pilot_release_approvals
         WHERE tenant_id = $1 AND target_version = $2 AND status = 'approved'
       )
       AND EXISTS(
         SELECT 1 FROM mobile_release_rollouts
         WHERE tenant_id = $1 AND target_version = $2
           AND status = 'completed' AND target_percentage = 100
       )
       AND NOT EXISTS(
         SELECT 1 FROM mobile_release_incidents
         WHERE tenant_id = $1 AND target_version = $2
           AND status IN ('open','acknowledged')
       ) AS ready`,
    [tenantId, targetVersion],
  );
  return result.rows[0]?.ready === true;
}

export async function productionLaunchRoutes(app: FastifyInstance) {
  app.get("/production-launches", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request) => {
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => ({
      launches: await readLaunches(client, user.tenantId),
    }));
  });

  app.post("/production-launches/activate", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed = activateProductionLaunchSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_PRODUCTION_ACTIVATION" });
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('production-launch:' || $1))`, [user.tenantId]);
      const review = await client.query<{ targetVersion: string }>(
        `SELECT target_version AS "targetVersion"
         FROM launch_readiness_reviews
         WHERE tenant_id = $1 AND id = $2 AND status = 'go'
           AND (decision_snapshot->>'ready')::boolean = true
         FOR UPDATE`,
        [user.tenantId, parsed.data.readinessReviewId],
      );
      const targetVersion = review.rows[0]?.targetVersion;
      if (!targetVersion) return { state: "review_missing" as const, launchId: null };
      if (!await liveGateReady(client, user.tenantId, targetVersion)) {
        return { state: "gate_failed" as const, launchId: null };
      }
      const inserted = await client.query<{ id: string }>(
        `WITH source AS (
           SELECT review.id, review.target_version, review.decision_notes,
                  review.decision_snapshot, review.decided_at, now() AS activated_at
           FROM launch_readiness_reviews review
           WHERE review.tenant_id = $1 AND review.id = $2 AND review.status = 'go'
         ), certificate AS (
           SELECT source.*,
                  jsonb_build_object(
                    'reviewId', source.id,
                    'targetVersion', source.target_version,
                    'readinessDecisionNotes', source.decision_notes,
                    'readinessDecidedAt', source.decided_at,
                    'readinessSnapshot', source.decision_snapshot,
                    'activationNotes', $3::text,
                    'activatedAt', source.activated_at
                  ) AS snapshot
           FROM source
         )
         INSERT INTO production_launches(
           tenant_id,readiness_review_id,target_version,certificate_snapshot,
           certificate_sha256,notes,status_reason,activated_by,activated_at,
           status_updated_by,status_updated_at
         )
         SELECT $1,id,target_version,snapshot,encode(digest(snapshot::text,'sha256'),'hex'),
                $3,$3,$4,activated_at,$4,activated_at
         FROM certificate
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [user.tenantId, parsed.data.readinessReviewId, parsed.data.notes, user.id],
      );
      const launchId = inserted.rows[0]?.id;
      if (!launchId) return { state: "conflict" as const, launchId: null };
      await client.query(
        `INSERT INTO production_launch_events(tenant_id,launch_id,action,reason,actor_user_id)
         VALUES($1,$2,'activated',$3,$4)`,
        [user.tenantId, launchId, parsed.data.notes, user.id],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'production.launch_activated','production_launch',$3,
                jsonb_build_object('targetVersion',$4,'reviewId',$5))`,
        [user.tenantId, user.id, launchId, targetVersion, parsed.data.readinessReviewId],
      );
      return { state: "activated" as const, launchId };
    });
    if (result.state === "review_missing") return reply.code(404).send({ error: "READY_GO_DECISION_NOT_FOUND" });
    if (result.state === "gate_failed") return reply.code(409).send({ error: "PRODUCTION_LIVE_GATE_FAILED" });
    if (result.state === "conflict") return reply.code(409).send({ error: "PRODUCTION_LAUNCH_CONFLICT" });
    return reply.code(201).send({ launchId: result.launchId });
  });

  app.post("/production-launches/:id/actions", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const launchId = (request.params as { id?: string }).id ?? "";
    const parsed = productionLaunchActionSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(launchId) || !parsed.success) return reply.code(400).send({ error: "INVALID_PRODUCTION_LAUNCH_ACTION" });
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      await client.query(`SELECT pg_advisory_xact_lock(hashtext('production-launch:' || $1))`, [user.tenantId]);
      const launch = await client.query<{ targetVersion: string; status: "active" | "suspended" }>(
        `SELECT target_version AS "targetVersion", status FROM production_launches
         WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [user.tenantId, launchId],
      );
      const row = launch.rows[0];
      if (!row) return "missing" as const;
      const expectedStatus = parsed.data.action === "suspend" ? "active" : "suspended";
      if (row.status !== expectedStatus) return "transition" as const;
      if (parsed.data.action === "resume") {
        const active = await client.query<{ exists: boolean }>(
          `SELECT EXISTS(
             SELECT 1 FROM production_launches
             WHERE tenant_id = $1 AND status = 'active' AND id <> $2
           ) AS exists`,
          [user.tenantId, launchId],
        );
        if (active.rows[0]?.exists) return "conflict" as const;
        if (!await liveGateReady(client, user.tenantId, row.targetVersion)) return "gate_failed" as const;
      }
      const nextStatus = parsed.data.action === "suspend" ? "suspended" : "active";
      await client.query(
        `UPDATE production_launches
         SET status = $3, status_reason = $4, status_updated_by = $5, status_updated_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status = $6`,
        [user.tenantId, launchId, nextStatus, parsed.data.reason, user.id, expectedStatus],
      );
      const eventAction = parsed.data.action === "suspend" ? "suspended" : "resumed";
      await client.query(
        `INSERT INTO production_launch_events(tenant_id,launch_id,action,reason,actor_user_id)
         VALUES($1,$2,$3,$4,$5)`,
        [user.tenantId, launchId, eventAction, parsed.data.reason, user.id],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'production.launch_' || $3,'production_launch',$4,
                jsonb_build_object('targetVersion',$5,'reason',$6))`,
        [user.tenantId, user.id, eventAction, launchId, row.targetVersion, parsed.data.reason],
      );
      return "updated" as const;
    });
    if (result === "missing") return reply.code(404).send({ error: "PRODUCTION_LAUNCH_NOT_FOUND" });
    if (result === "gate_failed") return reply.code(409).send({ error: "PRODUCTION_LIVE_GATE_FAILED" });
    if (result === "conflict") return reply.code(409).send({ error: "PRODUCTION_LAUNCH_CONFLICT" });
    if (result === "transition") return reply.code(409).send({ error: "INVALID_PRODUCTION_LAUNCH_TRANSITION" });
    return reply.code(204).send();
  });

  app.get("/production-launches/:id/certificate.json", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const launchId = (request.params as { id?: string }).id ?? "";
    if (!UUID_PATTERN.test(launchId)) return reply.code(400).send({ error: "INVALID_PRODUCTION_LAUNCH" });
    const user = request.sessionUser;
    const certificate = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<{ certificate: ProductionLaunchCertificate; sha256: string }>(
        `SELECT certificate_snapshot AS certificate, certificate_sha256 AS sha256
         FROM production_launches WHERE tenant_id = $1 AND id = $2`,
        [user.tenantId, launchId],
      );
      return result.rows[0] ?? null;
    });
    if (!certificate) return reply.code(404).send({ error: "PRODUCTION_LAUNCH_NOT_FOUND" });
    return reply.header("content-type", "application/json; charset=utf-8")
      .header("content-disposition", `attachment; filename="production-launch-${certificate.certificate.targetVersion}.json"`)
      .send(certificate);
  });
}
