import { withTenantTransaction } from "@filo/database";

type TenantClient = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];
type ArchiveSource = "manual" | "scheduler";
type AttemptSource = ArchiveSource | "retry";
type ArchiveSkipReason =
  | "invalid_actor"
  | "archive_in_progress"
  | "disabled"
  | "not_due"
  | "duplicate"
  | "attempt_not_running";

const outcomeCodeBySkipReason: Record<ArchiveSkipReason, string> = {
  invalid_actor: "INVALID_ACTOR",
  archive_in_progress: "ARCHIVE_IN_PROGRESS",
  disabled: "AUTOMATION_DISABLED",
  not_due: "ARCHIVE_NOT_DUE",
  duplicate: "DUPLICATE_RUN_KEY",
  attempt_not_running: "ATTEMPT_NOT_RUNNING",
};

export function archiveReconciliationNotificationCopy(
  reconciledCount: number,
) {
  if (!Number.isInteger(reconciledCount) || reconciledCount < 1) return null;
  return {
    sourceType: "archive_reconciliation" as const,
    title: "Arşivleme denemeleri uzlaştırıldı",
    message: `${reconciledCount} yarım kalmış arşivleme denemesi güvenli biçimde başarısız olarak işaretlendi. Kontrollü yeniden deneme gerekebilir.`,
    severity: "warning" as const,
    actionTarget: null,
  };
}

export function archiveReconciliationHandlingDeadline(
  handlingStatus: "not_required" | "open" | "acknowledged" | "resolved",
  acknowledgementDueAt: Date | null,
  resolutionDueAt: Date | null,
  now = new Date(),
) {
  const deadline =
    handlingStatus === "open"
      ? acknowledgementDueAt
      : handlingStatus === "acknowledged"
        ? resolutionDueAt
        : null;
  return {
    handlingDeadlineAt: deadline?.toISOString() ?? null,
    isHandlingOverdue: deadline ? deadline.getTime() < now.getTime() : false,
  };
}

export async function loadNotificationRetentionState(client: TenantClient) {
  const row = (
    await client.query(
      `SELECT read_retention_days AS "readRetentionDays",automatic_archive_enabled AS "automaticArchiveEnabled",archive_interval_hours AS "archiveIntervalHours",archive_batch_size AS "archiveBatchSize",last_archive_at AS "lastArchiveAt",last_archive_key AS "lastArchiveKey",last_archive_summary AS "lastArchiveSummary",automatic_reconciliation_enabled AS "automaticReconciliationEnabled",reconciliation_interval_minutes AS "reconciliationIntervalMinutes",reconciliation_stale_after_minutes AS "reconciliationStaleAfterMinutes",last_reconciliation_at AS "lastReconciliationAt",last_reconciliation_key AS "lastReconciliationKey",last_reconciliation_summary AS "lastReconciliationSummary",updated_at AS "updatedAt" FROM notification_retention_settings`,
    )
  ).rows[0];
  const readRetentionDays = row?.readRetentionDays ?? 90;
  const automaticArchiveEnabled = row?.automaticArchiveEnabled ?? false;
  const archiveIntervalHours = row?.archiveIntervalHours ?? 24;
  const lastArchiveAt = row?.lastArchiveAt?.toISOString() ?? null;
  const automaticReconciliationEnabled =
    row?.automaticReconciliationEnabled ?? false;
  const reconciliationIntervalMinutes =
    row?.reconciliationIntervalMinutes ?? 15;
  const reconciliationStaleAfterMinutes =
    row?.reconciliationStaleAfterMinutes ?? 15;
  const lastReconciliationAt =
    row?.lastReconciliationAt?.toISOString() ?? null;
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
    automaticReconciliationEnabled,
    reconciliationIntervalMinutes,
    reconciliationStaleAfterMinutes,
    lastReconciliationAt,
    lastReconciliationKey: row?.lastReconciliationKey ?? null,
    lastReconciliationSummary: row?.lastReconciliationSummary ?? null,
    nextReconciliationDueAt: automaticReconciliationEnabled
      ? lastReconciliationAt
        ? new Date(
            new Date(lastReconciliationAt).getTime() +
              reconciliationIntervalMinutes * 60_000,
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

async function createArchiveReconciliationNotifications(
  client: TenantClient,
  tenantId: string,
  reconciliationId: string,
  reconciledCount: number,
) {
  const copy = archiveReconciliationNotificationCopy(reconciledCount);
  if (!copy) return 0;
  const result = await client.query(
    `INSERT INTO in_app_notifications(tenant_id,rule_id,source_type,source_id,title,message,severity,vehicle_id,recipient_user_id,dedupe_key)
     SELECT $1,NULL,$2,$3,$4,$5,$6,NULL,m.user_id,$7
     FROM memberships m
     WHERE m.tenant_id=$1 AND m.role IN ('owner','admin','operator')
     ON CONFLICT DO NOTHING`,
    [
      tenantId,
      copy.sourceType,
      reconciliationId,
      copy.title,
      copy.message,
      copy.severity,
      `archive-reconciliation:${reconciliationId}`,
    ],
  );
  return result.rowCount ?? 0;
}

export async function runNotificationArchive(
  client: TenantClient,
  tenantId: string,
  actorUserId: string,
  runKey: string,
  source: ArchiveSource,
  force = false,
  attemptId: string | null = null,
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

  if (attemptId) {
    const activeAttempt = await client.query(
      `UPDATE notification_archive_attempts SET heartbeat_at=now() WHERE id=$1 AND status='running' RETURNING id`,
      [attemptId],
    );
    if (!activeAttempt.rowCount)
      return { skipped: true as const, reason: "attempt_not_running" as const };
  }

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
  if (attemptId) {
    await client.query(
      `UPDATE notification_archive_attempts SET heartbeat_at=now() WHERE id=$1 AND status='running'`,
      [attemptId],
    );
  }
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
    heartbeatAt: row.heartbeatAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    reconciledAt: row.reconciledAt?.toISOString() ?? null,
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
        `INSERT INTO notification_archive_attempts(tenant_id,run_key,source,retry_of_attempt_id,retry_number,initiated_by) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING id,run_key AS "runKey",source,status,outcome_code AS "outcomeCode",retry_of_attempt_id AS "retryOfAttemptId",retry_number AS "retryNumber",initiated_by AS "initiatedBy",archived_count AS "archivedCount",eligible_remaining AS "eligibleRemaining",started_at AS "startedAt",heartbeat_at AS "heartbeatAt",completed_at AS "completedAt",reconciled_at AS "reconciledAt",reconciled_by AS "reconciledBy",reconciliation_id AS "reconciliationId",created_at AS "createdAt"`,
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
        `UPDATE notification_archive_attempts SET status=$2,outcome_code=$3,archived_count=$4,eligible_remaining=$5,heartbeat_at=now(),completed_at=now() WHERE id=$1 AND status='running' RETURNING id,run_key AS "runKey",source,status,outcome_code AS "outcomeCode",retry_of_attempt_id AS "retryOfAttemptId",retry_number AS "retryNumber",initiated_by AS "initiatedBy",archived_count AS "archivedCount",eligible_remaining AS "eligibleRemaining",started_at AS "startedAt",heartbeat_at AS "heartbeatAt",completed_at AS "completedAt",reconciled_at AS "reconciledAt",reconciled_by AS "reconciledBy",reconciliation_id AS "reconciliationId",created_at AS "createdAt"`,
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
          started.attempt.id,
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
    if (result.reason === "attempt_not_running")
      return { accepted: false as const, reason: result.reason };
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

export async function reconcileStaleNotificationArchiveAttempts(input: {
  tenantId: string;
  actorUserId: string;
  reconciliationKey: string;
  source?: "manual" | "scheduler";
  force?: boolean;
}) {
  return withTenantTransaction(input.tenantId, input.actorUserId, async (client) => {
    const actor = await client.query(
      `SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`,
      [input.actorUserId, input.tenantId],
    );
    if (!actor.rowCount)
      return { accepted: false as const, reason: "invalid_actor" as const };

    const lock = (
      await client.query(
        `SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired`,
        [`notification-retention:${input.tenantId}`],
      )
    ).rows[0];
    if (!lock?.acquired)
      return { accepted: false as const, reason: "archive_in_progress" as const };

    const settings = await loadNotificationRetentionState(client);
    const source = input.source ?? "scheduler";
    if (!input.force && !settings.automaticReconciliationEnabled)
      return { accepted: false as const, reason: "disabled" as const };
    if (
      !input.force &&
      settings.nextReconciliationDueAt &&
      new Date(settings.nextReconciliationDueAt).getTime() > Date.now()
    )
      return {
        accepted: false as const,
        reason: "not_due" as const,
        nextDueAt: settings.nextReconciliationDueAt,
      };

    const reconciliation = (
      await client.query(
        `INSERT INTO notification_archive_reconciliations(tenant_id,reconciliation_key,stale_after_minutes,initiated_by,source) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id,created_at AS "createdAt"`,
        [
          input.tenantId,
          input.reconciliationKey,
          settings.reconciliationStaleAfterMinutes,
          input.actorUserId,
          source,
        ],
      )
    ).rows[0];
    if (!reconciliation)
      return { accepted: false as const, reason: "duplicate" as const };

    const reconciled = await client.query(
      `UPDATE notification_archive_attempts SET status='failed',outcome_code='ATTEMPT_HEARTBEAT_EXPIRED',heartbeat_at=now(),completed_at=now(),reconciled_at=now(),reconciled_by=$2,reconciliation_id=$3 WHERE tenant_id=$1 AND status='running' AND heartbeat_at<now()-($4::integer*interval '1 minute') RETURNING id`,
      [
        input.tenantId,
        input.actorUserId,
        reconciliation.id,
        settings.reconciliationStaleAfterMinutes,
      ],
    );
    const reconciledCount = reconciled.rowCount ?? 0;
    const notificationsCreated =
      await createArchiveReconciliationNotifications(
        client,
        input.tenantId,
        reconciliation.id,
        reconciledCount,
      );
    await client.query(
      `UPDATE notification_archive_reconciliations SET reconciled_count=$2,notifications_created=$3,handling_status=CASE WHEN $2>0 THEN 'open' ELSE 'not_required' END,acknowledgement_due_at=CASE WHEN $2>0 THEN now()+interval '1 hour' ELSE NULL END,resolution_due_at=CASE WHEN $2>0 THEN now()+interval '24 hours' ELSE NULL END,updated_at=now() WHERE id=$1`,
      [reconciliation.id, reconciledCount, notificationsCreated],
    );
    const summary = { reconciledCount, notificationsCreated, source };
    await client.query(
      `INSERT INTO notification_retention_settings(tenant_id,updated_by,last_reconciliation_at,last_reconciliation_key,last_reconciliation_summary) VALUES($1,$2,now(),$3,$4::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET last_reconciliation_at=EXCLUDED.last_reconciliation_at,last_reconciliation_key=EXCLUDED.last_reconciliation_key,last_reconciliation_summary=EXCLUDED.last_reconciliation_summary,updated_at=now()`,
      [
        input.tenantId,
        input.actorUserId,
        input.reconciliationKey,
        JSON.stringify(summary),
      ],
    );
    await client.query(
      `INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notification_archive.attempts_reconciled','notification_archive_reconciliation',$3,$4::jsonb)`,
      [
        input.tenantId,
        input.actorUserId,
        reconciliation.id,
        JSON.stringify({
          reconciliationKey: input.reconciliationKey,
          staleAfterMinutes: settings.reconciliationStaleAfterMinutes,
          reconciledCount,
          notificationsCreated,
          source,
        }),
      ],
    );
    return {
      accepted: true as const,
      reconciliationId: reconciliation.id as string,
      reconciliationKey: input.reconciliationKey,
      staleAfterMinutes: settings.reconciliationStaleAfterMinutes,
      reconciledCount,
      notificationsCreated,
      source,
      createdAt: reconciliation.createdAt.toISOString(),
      settings: await loadNotificationRetentionState(client),
    };
  });
}
