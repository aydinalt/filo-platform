import { withTenantTransaction } from "@filo/database";

type TenantClient = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];
type ArchiveSource = "manual" | "scheduler";
type AttemptSource = ArchiveSource | "retry";
type ArchiveSkipReason =
  | "invalid_actor"
  | "archive_in_progress"
  | "disabled"
  | "not_due"
  | "duplicate";

const outcomeCodeBySkipReason: Record<ArchiveSkipReason, string> = {
  invalid_actor: "INVALID_ACTOR",
  archive_in_progress: "ARCHIVE_IN_PROGRESS",
  disabled: "AUTOMATION_DISABLED",
  not_due: "ARCHIVE_NOT_DUE",
  duplicate: "DUPLICATE_RUN_KEY",
};

export async function loadNotificationRetentionState(client: TenantClient) {
  const row = (
    await client.query(
      `SELECT read_retention_days AS "readRetentionDays",automatic_archive_enabled AS "automaticArchiveEnabled",archive_interval_hours AS "archiveIntervalHours",archive_batch_size AS "archiveBatchSize",last_archive_at AS "lastArchiveAt",last_archive_key AS "lastArchiveKey",last_archive_summary AS "lastArchiveSummary",updated_at AS "updatedAt" FROM notification_retention_settings`,
    )
  ).rows[0];
  const readRetentionDays = row?.readRetentionDays ?? 90;
  const automaticArchiveEnabled = row?.automaticArchiveEnabled ?? false;
  const archiveIntervalHours = row?.archiveIntervalHours ?? 24;
  const lastArchiveAt = row?.lastArchiveAt?.toISOString() ?? null;
  return {
    readRetentionDays,
    automaticArchiveEnabled,
    archiveIntervalHours,
    archiveBatchSize: row?.archiveBatchSize ?? 500,
    lastArchiveAt,
    lastArchiveKey: row?.lastArchiveKey ?? null,
    lastArchiveSummary: row?.lastArchiveSummary ?? null,
    nextDueAt: automaticArchiveEnabled
      ? lastArchiveAt
        ? new Date(
            new Date(lastArchiveAt).getTime() +
              archiveIntervalHours * 3_600_000,
          ).toISOString()
        : new Date().toISOString()
      : null,
    updatedAt: row?.updatedAt?.toISOString() ?? null,
  };
}

export async function countEligibleNotifications(
  client: TenantClient,
  retentionDays: number,
) {
  const row = (
    await client.query(
      `SELECT count(*)::integer AS count FROM in_app_notifications n WHERE n.archived_at IS NULL AND n.read_at IS NOT NULL AND n.read_at<now()-($1::integer*interval '1 day') AND (n.source_type<>'provider_incident' OR EXISTS(SELECT 1 FROM notification_provider_incidents i WHERE i.id=n.source_id AND i.tenant_id=n.tenant_id AND i.status='resolved'))`,
      [retentionDays],
    )
  ).rows[0];
  return row?.count ?? 0;
}

export async function runNotificationArchive(
  client: TenantClient,
  tenantId: string,
  actorUserId: string,
  runKey: string,
  source: ArchiveSource,
  force = false,
) {
  const actor = await client.query(
    `SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`,
    [actorUserId, tenantId],
  );
  if (!actor.rowCount)
    return { skipped: true as const, reason: "invalid_actor" as const };

  const lock = (
    await client.query(
      `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired`,
      [`notification-retention:${tenantId}`],
    )
  ).rows[0];
  if (!lock?.acquired)
    return { skipped: true as const, reason: "archive_in_progress" as const };

  const settings = await loadNotificationRetentionState(client);
  if (!force && !settings.automaticArchiveEnabled)
    return { skipped: true as const, reason: "disabled" as const };
  if (
    !force &&
    settings.nextDueAt &&
    new Date(settings.nextDueAt).getTime() > Date.now()
  )
    return {
      skipped: true as const,
      reason: "not_due" as const,
      nextDueAt: settings.nextDueAt,
    };

  const duplicate = await client.query(
    `SELECT 1 FROM notification_archive_runs WHERE run_key=$1`,
    [runKey],
  );
  if (duplicate.rowCount)
    return { skipped: true as const, reason: "duplicate" as const };

  const run = (
    await client.query(
      `INSERT INTO notification_archive_runs(tenant_id,run_key,source,cutoff_at,retention_days,batch_size,initiated_by) VALUES($1,$2,$3,now()-($4::integer*interval '1 day'),$4,$5,$6) RETURNING id,run_key AS "runKey",source,cutoff_at AS "cutoffAt",retention_days AS "retentionDays",batch_size AS "batchSize",archived_count AS "archivedCount",initiated_by AS "initiatedBy",created_at AS "createdAt"`,
      [
        tenantId,
        runKey,
        source,
        settings.readRetentionDays,
        settings.archiveBatchSize,
        actorUserId,
      ],
    )
  ).rows[0];
  const archived = await client.query(
    `WITH eligible AS (SELECT n.id FROM in_app_notifications n WHERE n.archived_at IS NULL AND n.read_at IS NOT NULL AND n.read_at<$1 AND (n.source_type<>'provider_incident' OR EXISTS(SELECT 1 FROM notification_provider_incidents i WHERE i.id=n.source_id AND i.tenant_id=n.tenant_id AND i.status='resolved')) ORDER BY n.read_at,n.id LIMIT $4 FOR UPDATE OF n SKIP LOCKED) UPDATE in_app_notifications n SET archived_at=now(),archived_by=$2,archive_batch_id=$3 FROM eligible e WHERE n.id=e.id`,
    [run.cutoffAt, actorUserId, run.id, settings.archiveBatchSize],
  );
  run.archivedCount = archived.rowCount ?? 0;
  const eligibleRemaining = await countEligibleNotifications(
    client,
    settings.readRetentionDays,
  );
  const summary = {
    archivedCount: run.archivedCount,
    eligibleRemaining,
    source,
  };
  await client.query(
    `UPDATE notification_archive_runs SET archived_count=$2 WHERE id=$1`,
    [run.id, run.archivedCount],
  );
  await client.query(
    `INSERT INTO notification_retention_settings(tenant_id,updated_by,last_archive_at,last_archive_key,last_archive_summary) VALUES($1,$2,now(),$3,$4::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET last_archive_at=EXCLUDED.last_archive_at,last_archive_key=EXCLUDED.last_archive_key,last_archive_summary=EXCLUDED.last_archive_summary,updated_at=now()`,
    [tenantId, actorUserId, runKey, JSON.stringify(summary)],
  );
  await client.query(
    `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notifications.archived','notification_archive_run',$3,$4::jsonb)`,
    [
      tenantId,
      actorUserId,
      run.id,
      JSON.stringify({
        ...summary,
        retentionDays: settings.readRetentionDays,
        batchSize: settings.archiveBatchSize,
        runKey,
      }),
    ],
  );
  return {
    skipped: false as const,
    run: {
      ...run,
      cutoffAt: run.cutoffAt.toISOString(),
      createdAt: run.createdAt.toISOString(),
    },
    summary,
    settings: await loadNotificationRetentionState(client),
  };
}

function shapeAttempt(row: any) {
  return {
    ...row,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function loadRetryContext(
  client: TenantClient,
  retryOfAttemptId: string | null,
) {
  if (!retryOfAttemptId) return { retryOfAttemptId: null, retryNumber: 0 };
  const original = (
    await client.query(
      `SELECT id,status,retry_number AS "retryNumber" FROM notification_archive_attempts WHERE id=$1`,
      [retryOfAttemptId],
    )
  ).rows[0];
  if (!original || original.status !== "failed") return null;
  if (original.retryNumber >= 3) return null;
  return {
    retryOfAttemptId: original.id,
    retryNumber: original.retryNumber + 1,
  };
}

async function beginArchiveAttempt(
  tenantId: string,
  actorUserId: string,
  runKey: string,
  source: AttemptSource,
  retryOfAttemptId: string | null,
) {
  return withTenantTransaction(tenantId, actorUserId, async (client) => {
    const actor = await client.query(
      `SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`,
      [actorUserId, tenantId],
    );
    if (!actor.rowCount)
      return { created: false as const, reason: "invalid_actor" as const };
    const retry = await loadRetryContext(client, retryOfAttemptId);
    if (!retry)
      return { created: false as const, reason: "retry_not_allowed" as const };
    const row = (
      await client.query(
        `INSERT INTO notification_archive_attempts(tenant_id,run_key,source,retry_of_attempt_id,retry_number,initiated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id,run_key AS "runKey",source,status,outcome_code AS "outcomeCode",retry_of_attempt_id AS "retryOfAttemptId",retry_number AS "retryNumber",initiated_by AS "initiatedBy",archived_count AS "archivedCount",eligible_remaining AS "eligibleRemaining",started_at AS "startedAt",completed_at AS "completedAt",created_at AS "createdAt"`,
        [
          tenantId,
          runKey,
          source,
          retry.retryOfAttemptId,
          retry.retryNumber,
          actorUserId,
        ],
      )
    ).rows[0];
    if (!row) return { created: false as const, reason: "duplicate" as const };
    return { created: true as const, attempt: shapeAttempt(row) };
  });
}

async function finishArchiveAttempt(
  tenantId: string,
  actorUserId: string,
  attemptId: string,
  status: "succeeded" | "skipped" | "failed",
  outcomeCode: string,
  archivedCount: number | null,
  eligibleRemaining: number | null,
) {
  return withTenantTransaction(tenantId, actorUserId, async (client) => {
    const row = (
      await client.query(
        `UPDATE notification_archive_attempts SET status=$2,outcome_code=$3,archived_count=$4,eligible_remaining=$5,completed_at=now() WHERE id=$1 AND status='running' RETURNING id,run_key AS "runKey",source,status,outcome_code AS "outcomeCode",retry_of_attempt_id AS "retryOfAttemptId",retry_number AS "retryNumber",initiated_by AS "initiatedBy",archived_count AS "archivedCount",eligible_remaining AS "eligibleRemaining",started_at AS "startedAt",completed_at AS "completedAt",created_at AS "createdAt"`,
        [attemptId, status, outcomeCode, archivedCount, eligibleRemaining],
      )
    ).rows[0];
    if (!row) throw new Error("notification archive attempt is not running");
    await client.query(
      `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_archive.attempt_completed','notification_archive_attempt',$3,$4::jsonb)`,
      [
        tenantId,
        actorUserId,
        attemptId,
        JSON.stringify({
          status,
          outcomeCode,
          archivedCount,
          eligibleRemaining,
        }),
      ],
    );
    return shapeAttempt(row);
  });
}

export async function executeNotificationArchiveAttempt(input: {
  tenantId: string;
  actorUserId: string;
  runKey: string;
  source: AttemptSource;
  force?: boolean;
  retryOfAttemptId?: string | null;
}) {
  const started = await beginArchiveAttempt(
    input.tenantId,
    input.actorUserId,
    input.runKey,
    input.source,
    input.retryOfAttemptId ?? null,
  );
  if (!started.created)
    return { accepted: false as const, reason: started.reason };
  let result: Awaited<ReturnType<typeof runNotificationArchive>>;
  try {
    const archiveSource: ArchiveSource =
      input.source === "scheduler" ? "scheduler" : "manual";
    result = await withTenantTransaction(
      input.tenantId,
      input.actorUserId,
      (client) =>
        runNotificationArchive(
          client,
          input.tenantId,
          input.actorUserId,
          input.runKey,
          archiveSource,
          input.force ?? input.source !== "scheduler",
        ),
    );
  } catch (error) {
    const attempt = await finishArchiveAttempt(
      input.tenantId,
      input.actorUserId,
      started.attempt.id,
      "failed",
      "ARCHIVE_EXECUTION_FAILED",
      null,
      null,
    );
    return {
      accepted: true as const,
      failed: true as const,
      attempt,
      error: "NOTIFICATION_ARCHIVE_FAILED" as const,
    };
  }
  if (result.skipped) {
    const attempt = await finishArchiveAttempt(
      input.tenantId,
      input.actorUserId,
      started.attempt.id,
      "skipped",
      outcomeCodeBySkipReason[result.reason],
      null,
      null,
    );
    return { accepted: true as const, failed: false as const, attempt, result };
  }
  const attempt = await finishArchiveAttempt(
    input.tenantId,
    input.actorUserId,
    started.attempt.id,
    "succeeded",
    "ARCHIVE_COMPLETED",
    result.summary.archivedCount,
    result.summary.eligibleRemaining,
  );
  return { accepted: true as const, failed: false as const, attempt, result };
}
