import type { FastifyInstance } from "fastify";
import type { PoolClient } from "pg";
import {
  createLaunchReadinessReviewSchema,
  decideLaunchReadinessSchema,
  launchReadinessEvidenceTypeSchema,
  updateLaunchReadinessEvidenceSchema,
  type LaunchReadinessAssessment,
  type LaunchReadinessEvidence,
  type LaunchReadinessReview,
  type LaunchReadinessSnapshot,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import {
  assessLaunchReadiness,
  launchReadinessEvidenceTypes,
} from "../lib/launch-readiness.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/u;

type ReviewRow = Omit<LaunchReadinessReview, "evidence" | "createdAt" | "decidedAt"> & {
  createdAt: Date;
  decidedAt: Date | null;
};

type EvidenceRow = Omit<LaunchReadinessEvidence, "updatedAt"> & { updatedAt: Date | null };

async function readAssessment(client: PoolClient, tenantId: string, targetVersion: string) {
  const result = await client.query<{
    pilotApproval: boolean;
    completedRollout: boolean;
    activeIncidentCount: number;
  }>(
    `SELECT
       EXISTS(
         SELECT 1 FROM mobile_pilot_release_approvals
         WHERE tenant_id = $1 AND target_version = $2 AND status = 'approved'
       ) AS "pilotApproval",
       EXISTS(
         SELECT 1 FROM mobile_release_rollouts
         WHERE tenant_id = $1 AND target_version = $2
           AND status = 'completed' AND target_percentage = 100
       ) AS "completedRollout",
       (SELECT count(*)::integer
        FROM mobile_release_incidents incident
        WHERE incident.tenant_id = $1 AND incident.target_version = $2
          AND incident.status IN ('open','acknowledged')) AS "activeIncidentCount"`,
    [tenantId, targetVersion],
  );
  return assessLaunchReadiness(targetVersion, result.rows[0] ?? {
    pilotApproval: false,
    completedRollout: false,
    activeIncidentCount: 0,
  });
}

async function readEvidence(client: PoolClient, tenantId: string, reviewId: string) {
  const result = await client.query<EvidenceRow>(
    `SELECT evidence_type AS type, status, notes, updated_at AS "updatedAt"
     FROM launch_readiness_evidence
     WHERE tenant_id = $1 AND review_id = $2
     ORDER BY evidence_type`,
    [tenantId, reviewId],
  );
  return result.rows.map((row) => ({
    ...row,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  }));
}

async function readReviews(client: PoolClient, tenantId: string, targetVersion: string) {
  const result = await client.query<ReviewRow>(
    `SELECT id, target_version AS "targetVersion", status, notes,
            decision_notes AS "decisionNotes", decision_snapshot AS "decisionSnapshot",
            created_at AS "createdAt", decided_at AS "decidedAt"
     FROM launch_readiness_reviews
     WHERE tenant_id = $1 AND target_version = $2
     ORDER BY created_at DESC LIMIT 20`,
    [tenantId, targetVersion],
  );
  return Promise.all(result.rows.map(async (row): Promise<LaunchReadinessReview> => ({
    ...row,
    evidence: await readEvidence(client, tenantId, row.id),
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  })));
}

function snapshotReady(automated: LaunchReadinessAssessment, evidence: LaunchReadinessEvidence[]) {
  return automated.ready
    && launchReadinessEvidenceTypes.every((type) =>
      evidence.some((item) => item.type === type && item.status === "passed"));
}

export async function launchReadinessRoutes(app: FastifyInstance) {
  app.get("/launch-readiness", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const targetVersion = String((request.query as { version?: string }).version ?? "");
    if (!VERSION_PATTERN.test(targetVersion)) return reply.code(400).send({ error: "INVALID_LAUNCH_VERSION" });
    const user = request.sessionUser;
    return withTenantTransaction(user.tenantId, user.id, async (client) => ({
      assessment: await readAssessment(client, user.tenantId, targetVersion),
      reviews: await readReviews(client, user.tenantId, targetVersion),
    }));
  });

  app.post("/launch-readiness/reviews", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const parsed = createLaunchReadinessReviewSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "INVALID_LAUNCH_REVIEW" });
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtext('launch-readiness:' || $1 || ':' || $2))`,
        [user.tenantId, parsed.data.targetVersion],
      );
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO launch_readiness_reviews(tenant_id,target_version,notes,created_by)
         VALUES($1,$2,$3,$4)
         ON CONFLICT (tenant_id,target_version) WHERE status = 'draft' DO NOTHING
         RETURNING id`,
        [user.tenantId, parsed.data.targetVersion, parsed.data.notes, user.id],
      );
      const reviewId = inserted.rows[0]?.id;
      if (!reviewId) return null;
      await client.query(
        `INSERT INTO launch_readiness_evidence(tenant_id,review_id,evidence_type)
         SELECT $1,$2,unnest($3::text[])`,
        [user.tenantId, reviewId, launchReadinessEvidenceTypes],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'launch.readiness_review_created','launch_readiness_review',$3,
                jsonb_build_object('targetVersion',$4))`,
        [user.tenantId, user.id, reviewId, parsed.data.targetVersion],
      );
      return reviewId;
    });
    if (!result) return reply.code(409).send({ error: "ACTIVE_LAUNCH_REVIEW_EXISTS" });
    return reply.code(201).send({ reviewId: result });
  });

  app.patch("/launch-readiness/reviews/:id/evidence/:type", { preHandler: [requireSession, allow("owner", "admin")] }, async (request, reply) => {
    const { id = "", type = "" } = request.params as { id?: string; type?: string };
    const evidenceType = launchReadinessEvidenceTypeSchema.safeParse(type);
    const parsed = updateLaunchReadinessEvidenceSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(id) || !evidenceType.success || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_LAUNCH_EVIDENCE" });
    }
    const user = request.sessionUser;
    const updated = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query(
        `UPDATE launch_readiness_evidence evidence
         SET status = $4, notes = $5, updated_by = $3, updated_at = now()
         FROM launch_readiness_reviews review
         WHERE evidence.tenant_id = $1 AND evidence.review_id = $2
           AND evidence.evidence_type = $6
           AND review.id = evidence.review_id AND review.tenant_id = evidence.tenant_id
           AND review.status = 'draft'
         RETURNING evidence.id`,
        [user.tenantId, id, user.id, parsed.data.status, parsed.data.notes, evidenceType.data],
      );
      if (!result.rows[0]) return false;
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'launch.readiness_evidence_updated','launch_readiness_review',$3,
                jsonb_build_object('evidenceType',$4,'status',$5))`,
        [user.tenantId, user.id, id, evidenceType.data, parsed.data.status],
      );
      return true;
    });
    return updated ? reply.code(204).send() : reply.code(404).send({ error: "DRAFT_LAUNCH_REVIEW_NOT_FOUND" });
  });

  app.post("/launch-readiness/reviews/:id/decision", { preHandler: [requireSession, allow("owner")] }, async (request, reply) => {
    const id = (request.params as { id?: string }).id ?? "";
    const parsed = decideLaunchReadinessSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(id) || !parsed.success) return reply.code(400).send({ error: "INVALID_LAUNCH_DECISION" });
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const review = await client.query<{ targetVersion: string }>(
        `SELECT target_version AS "targetVersion" FROM launch_readiness_reviews
         WHERE tenant_id = $1 AND id = $2 AND status = 'draft' FOR UPDATE`,
        [user.tenantId, id],
      );
      const targetVersion = review.rows[0]?.targetVersion;
      if (!targetVersion) return { found: false, ready: false };
      const [automated, evidence] = await Promise.all([
        readAssessment(client, user.tenantId, targetVersion),
        readEvidence(client, user.tenantId, id),
      ]);
      const ready = snapshotReady(automated, evidence);
      if (parsed.data.decision === "go" && !ready) return { found: true, ready: false };
      const snapshot: LaunchReadinessSnapshot = { automated, evidence, ready };
      await client.query(
        `UPDATE launch_readiness_reviews
         SET status = $3, decision_notes = $4, decision_snapshot = $5::jsonb,
             decided_by = $6, decided_at = now()
         WHERE tenant_id = $1 AND id = $2 AND status = 'draft'`,
        [user.tenantId, id, parsed.data.decision, parsed.data.notes, JSON.stringify(snapshot), user.id],
      );
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'launch.readiness_' || $3,'launch_readiness_review',$4,
                jsonb_build_object('targetVersion',$5,'ready',$6))`,
        [user.tenantId, user.id, parsed.data.decision, id, targetVersion, ready],
      );
      return { found: true, ready };
    });
    if (!result.found) return reply.code(404).send({ error: "DRAFT_LAUNCH_REVIEW_NOT_FOUND" });
    if (parsed.data.decision === "go" && !result.ready) {
      return reply.code(409).send({ error: "LAUNCH_READINESS_GATE_FAILED" });
    }
    return reply.code(204).send();
  });
}
