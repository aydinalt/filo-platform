import type { FastifyInstance } from "fastify";
import {
  createMobilePilotRunSchema,
  decideMobilePilotRunSchema,
  type MobilePilotEvidence,
  type MobilePilotEvidenceType,
  type MobilePilotRun,
} from "@filo/contracts";
import { withTenantTransaction } from "@filo/database";
import { requireSession } from "../lib/auth.js";
import { allow } from "../lib/permissions.js";
import {
  REQUIRED_MOBILE_PILOT_EVIDENCE,
  assessMobilePilotEvidence,
} from "../lib/mobile-pilot-evidence.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

type RunRow = Omit<MobilePilotRun, "startedAt" | "completedAt" | "evidence" | "readiness"> & {
  startedAt: Date;
  completedAt: Date | null;
};

type EvidenceRow = Omit<MobilePilotEvidence, "firstObservedAt" | "lastObservedAt"> & {
  runId: string;
  firstObservedAt: Date;
  lastObservedAt: Date;
};

function serializeRun(row: RunRow, evidence: MobilePilotEvidence[]): MobilePilotRun {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    evidence,
    readiness: assessMobilePilotEvidence(evidence.map((item) => item.type)),
  };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function readRuns(tenantId: string, actorUserId: string) {
  return withTenantTransaction(tenantId, actorUserId, async (client) => {
    const [runs, evidence] = await Promise.all([
      client.query<RunRow>(
        `SELECT run.id, run.credential_id AS "credentialId",
                vehicle.plate AS "vehiclePlate", driver.full_name AS "driverName",
                credential.device_name AS "deviceName",
                COALESCE(run.qualified_device_manufacturer, credential.device_manufacturer) AS "deviceManufacturer",
                COALESCE(run.qualified_device_model, credential.device_model) AS "deviceModel",
                COALESCE(run.qualified_app_version, credential.app_version) AS "appVersion",
                credential.platform,
                run.status, run.notes, run.started_at AS "startedAt",
                run.completed_at AS "completedAt"
         FROM mobile_pilot_runs run
         JOIN mobile_access_credentials credential
           ON credential.id = run.credential_id AND credential.tenant_id = run.tenant_id
         JOIN vehicle_driver_assignments assignment
           ON assignment.id = credential.assignment_id AND assignment.tenant_id = run.tenant_id
         JOIN vehicles vehicle ON vehicle.id = assignment.vehicle_id AND vehicle.tenant_id = run.tenant_id
         JOIN drivers driver ON driver.id = assignment.driver_id AND driver.tenant_id = run.tenant_id
         WHERE run.tenant_id = $1
         ORDER BY run.started_at DESC LIMIT 100`,
        [tenantId],
      ),
      client.query<EvidenceRow>(
        `SELECT evidence.run_id AS "runId", evidence.evidence_type AS type,
                evidence.first_observed_at AS "firstObservedAt",
                evidence.last_observed_at AS "lastObservedAt",
                evidence.observation_count AS "observationCount", evidence.details
         FROM mobile_pilot_evidence evidence
         JOIN mobile_pilot_runs run ON run.id = evidence.run_id AND run.tenant_id = evidence.tenant_id
         WHERE evidence.tenant_id = $1
         ORDER BY evidence.first_observed_at ASC`,
        [tenantId],
      ),
    ]);
    return runs.rows.map((run) => serializeRun(
      run,
      evidence.rows.filter((item) => item.runId === run.id).map((item) => ({
        type: item.type,
        firstObservedAt: item.firstObservedAt.toISOString(),
        lastObservedAt: item.lastObservedAt.toISOString(),
        observationCount: item.observationCount,
        details: item.details,
      })),
    ));
  });
}

export async function mobilePilotRunRoutes(app: FastifyInstance) {
  app.get("/pilot-runs", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request) => {
    const user = request.sessionUser;
    return { runs: await readRuns(user.tenantId, user.id), requiredEvidence: REQUIRED_MOBILE_PILOT_EVIDENCE };
  });

  app.post("/devices/:id/pilot-runs", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const credentialId = (request.params as { id?: string }).id ?? "";
    const parsed = createMobilePilotRunSchema.safeParse(request.body ?? {});
    if (!UUID_PATTERN.test(credentialId) || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_MOBILE_PILOT_RUN" });
    }
    const user = request.sessionUser;
    const created = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const result = await client.query<{ id: string }>(
        `INSERT INTO mobile_pilot_runs(tenant_id, credential_id, notes, started_by)
         SELECT $1, credential.id, $3, $4
         FROM mobile_access_credentials credential
         WHERE credential.tenant_id = $1 AND credential.id = $2
           AND credential.revoked_at IS NULL AND credential.expires_at > now()
         ON CONFLICT (tenant_id, credential_id) WHERE status = 'running' DO NOTHING
         RETURNING id`,
        [user.tenantId, credentialId, parsed.data.notes ?? null, user.id],
      );
      const row = result.rows[0];
      if (!row) return null;
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.pilot_run_started','mobile_pilot_run',$3,
                jsonb_build_object('credentialId',$4))`,
        [user.tenantId, user.id, row.id, credentialId],
      );
      return row.id;
    });
    if (!created) return reply.code(409).send({ error: "DEVICE_NOT_FOUND_OR_PILOT_RUNNING" });
    const run = (await readRuns(user.tenantId, user.id)).find((item) => item.id === created);
    return reply.code(201).send({ run });
  });

  app.patch("/pilot-runs/:id/decision", { preHandler: [requireSession, allow("owner", "admin")] }, async (request, reply) => {
    const runId = (request.params as { id?: string }).id ?? "";
    const parsed = decideMobilePilotRunSchema.safeParse(request.body);
    if (!UUID_PATTERN.test(runId) || !parsed.success) {
      return reply.code(400).send({ error: "INVALID_MOBILE_PILOT_DECISION" });
    }
    const user = request.sessionUser;
    const result = await withTenantTransaction(user.tenantId, user.id, async (client) => {
      const current = await client.query<{
        status: string;
        appVersion: string | null;
        deviceManufacturer: string;
        deviceModel: string;
      }>(
        `SELECT run.status, credential.app_version AS "appVersion",
                credential.device_manufacturer AS "deviceManufacturer",
                credential.device_model AS "deviceModel"
         FROM mobile_pilot_runs run
         JOIN mobile_access_credentials credential
           ON credential.id = run.credential_id AND credential.tenant_id = run.tenant_id
         WHERE run.tenant_id = $1 AND run.id = $2
         FOR UPDATE`,
        [user.tenantId, runId],
      );
      if (current.rows[0]?.status !== "running") {
        return { updated: false, missing: null, metadataIncomplete: false };
      }
      const evidence = await client.query<{ type: MobilePilotEvidenceType }>(
        `SELECT evidence_type AS type FROM mobile_pilot_evidence
         WHERE tenant_id = $1 AND run_id = $2`,
        [user.tenantId, runId],
      );
      const readiness = assessMobilePilotEvidence(evidence.rows.map((item) => item.type));
      if (parsed.data.decision === "passed" && !readiness.ready) {
        return { updated: false, missing: readiness.missing, metadataIncomplete: false };
      }
      const device = current.rows[0]!;
      const metadataIncomplete = parsed.data.decision === "passed" && (
        !device.appVersion?.match(/^\d+\.\d+\.\d+$/u)
        || device.deviceManufacturer.toLocaleLowerCase("en-US") === "unknown"
        || device.deviceModel.toLocaleLowerCase("en-US") === "unknown"
      );
      if (metadataIncomplete) {
        return { updated: false, missing: null, metadataIncomplete: true };
      }
      const updated = await client.query(
        `UPDATE mobile_pilot_runs
         SET status = $3, notes = $4, completed_by = $5, completed_at = now(),
             qualified_app_version = CASE WHEN $3 = 'passed' THEN $6 ELSE qualified_app_version END,
             qualified_device_manufacturer = CASE WHEN $3 = 'passed' THEN $7 ELSE qualified_device_manufacturer END,
             qualified_device_model = CASE WHEN $3 = 'passed' THEN $8 ELSE qualified_device_model END
         WHERE tenant_id = $1 AND id = $2 AND status = 'running'`,
        [
          user.tenantId, runId, parsed.data.decision, parsed.data.notes, user.id,
          device.appVersion, device.deviceManufacturer, device.deviceModel,
        ],
      );
      if (!updated.rowCount) return { updated: false, missing: null, metadataIncomplete: false };
      await client.query(
        `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata)
         VALUES($1,$2,'mobile.pilot_run_decided','mobile_pilot_run',$3,
                jsonb_build_object('decision',$4,'notes',$5,'evidenceCount',$6))`,
        [user.tenantId, user.id, runId, parsed.data.decision, parsed.data.notes, readiness.passedCount],
      );
      return { updated: true, missing: null, metadataIncomplete: false };
    });
    if (!result.updated) {
      return reply.code(result.missing || result.metadataIncomplete ? 409 : 404).send({
        error: result.missing
          ? "PILOT_EVIDENCE_INCOMPLETE"
          : result.metadataIncomplete
            ? "PILOT_DEVICE_METADATA_INCOMPLETE"
            : "RUNNING_PILOT_NOT_FOUND",
        missing: result.missing ?? undefined,
      });
    }
    const run = (await readRuns(user.tenantId, user.id)).find((item) => item.id === runId);
    return { run };
  });

  app.get("/pilot-runs/:id/report.csv", { preHandler: [requireSession, allow("owner", "admin", "operator")] }, async (request, reply) => {
    const runId = (request.params as { id?: string }).id ?? "";
    if (!UUID_PATTERN.test(runId)) return reply.code(400).send({ error: "INVALID_MOBILE_PILOT_RUN" });
    const user = request.sessionUser;
    const run = (await readRuns(user.tenantId, user.id)).find((item) => item.id === runId);
    if (!run) return reply.code(404).send({ error: "MOBILE_PILOT_RUN_NOT_FOUND" });
    const evidence = new Map(run.evidence.map((item) => [item.type, item]));
    const rows = [
      ["pilot_id", "vehicle", "driver", "device", "platform", "status", "started_at", "completed_at", "evidence", "observed_at", "count"],
      ...REQUIRED_MOBILE_PILOT_EVIDENCE.map((type) => {
        const item = evidence.get(type);
        return [run.id, run.vehiclePlate, run.driverName, run.deviceName, run.platform, run.status,
          run.startedAt, run.completedAt, type, item?.lastObservedAt ?? "MISSING", item?.observationCount ?? 0];
      }),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
    return reply
      .header("content-type", "text/csv; charset=utf-8")
      .header("content-disposition", `attachment; filename="mobile-pilot-${run.id}.csv"`)
      .send(csv);
  });
}
