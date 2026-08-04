import { withTenantTransaction } from "@filo/database";

type TenantClient = Parameters<Parameters<typeof withTenantTransaction>[2]>[0];
type ArchiveSource = "manual" | "scheduler";

export async function loadNotificationRetentionState(client:TenantClient){
  const row=(await client.query(`SELECT read_retention_days AS "readRetentionDays",automatic_archive_enabled AS "automaticArchiveEnabled",archive_interval_hours AS "archiveIntervalHours",archive_batch_size AS "archiveBatchSize",last_archive_at AS "lastArchiveAt",last_archive_key AS "lastArchiveKey",last_archive_summary AS "lastArchiveSummary",updated_at AS "updatedAt" FROM notification_retention_settings`)).rows[0];
  const readRetentionDays=row?.readRetentionDays??90;
  const automaticArchiveEnabled=row?.automaticArchiveEnabled??false;
  const archiveIntervalHours=row?.archiveIntervalHours??24;
  const lastArchiveAt=row?.lastArchiveAt?.toISOString()??null;
  return{
    readRetentionDays,
    automaticArchiveEnabled,
    archiveIntervalHours,
    archiveBatchSize:row?.archiveBatchSize??500,
    lastArchiveAt,
    lastArchiveKey:row?.lastArchiveKey??null,
    lastArchiveSummary:row?.lastArchiveSummary??null,
    nextDueAt:automaticArchiveEnabled?(lastArchiveAt?new Date(new Date(lastArchiveAt).getTime()+archiveIntervalHours*3_600_000).toISOString():new Date().toISOString()):null,
    updatedAt:row?.updatedAt?.toISOString()??null
  };
}

export async function countEligibleNotifications(client:TenantClient,retentionDays:number){
  const row=(await client.query(`SELECT count(*)::integer AS count FROM in_app_notifications n WHERE n.archived_at IS NULL AND n.read_at IS NOT NULL AND n.read_at<now()-($1::integer*interval '1 day') AND (n.source_type<>'provider_incident' OR EXISTS(SELECT 1 FROM notification_provider_incidents i WHERE i.id=n.source_id AND i.tenant_id=n.tenant_id AND i.status='resolved'))`,[retentionDays])).rows[0];
  return row?.count??0;
}

export async function runNotificationArchive(client:TenantClient,tenantId:string,actorUserId:string,runKey:string,source:ArchiveSource,force=false){
  const actor=await client.query(`SELECT 1 FROM users WHERE id=$1 AND tenant_id=$2`,[actorUserId,tenantId]);
  if(!actor.rowCount)return{skipped:true as const,reason:"invalid_actor" as const};

  const lock=(await client.query(`SELECT pg_try_advisory_xact_lock(hashtextextended($1,0)) AS acquired`,[`notification-retention:${tenantId}`])).rows[0];
  if(!lock?.acquired)return{skipped:true as const,reason:"archive_in_progress" as const};

  const settings=await loadNotificationRetentionState(client);
  if(!force&&!settings.automaticArchiveEnabled)return{skipped:true as const,reason:"disabled" as const};
  if(!force&&settings.nextDueAt&&new Date(settings.nextDueAt).getTime()>Date.now())return{skipped:true as const,reason:"not_due" as const,nextDueAt:settings.nextDueAt};

  const duplicate=await client.query(`SELECT 1 FROM notification_archive_runs WHERE run_key=$1`,[runKey]);
  if(duplicate.rowCount)return{skipped:true as const,reason:"duplicate" as const};

  const run=(await client.query(`INSERT INTO notification_archive_runs(tenant_id,run_key,source,cutoff_at,retention_days,batch_size,initiated_by) VALUES($1,$2,$3,now()-($4::integer*interval '1 day'),$4,$5,$6) RETURNING id,run_key AS "runKey",source,cutoff_at AS "cutoffAt",retention_days AS "retentionDays",batch_size AS "batchSize",archived_count AS "archivedCount",initiated_by AS "initiatedBy",created_at AS "createdAt"`,[tenantId,runKey,source,settings.readRetentionDays,settings.archiveBatchSize,actorUserId])).rows[0];
  const archived=await client.query(`WITH eligible AS (SELECT n.id FROM in_app_notifications n WHERE n.archived_at IS NULL AND n.read_at IS NOT NULL AND n.read_at<$1 AND (n.source_type<>'provider_incident' OR EXISTS(SELECT 1 FROM notification_provider_incidents i WHERE i.id=n.source_id AND i.tenant_id=n.tenant_id AND i.status='resolved')) ORDER BY n.read_at,n.id LIMIT $4 FOR UPDATE OF n SKIP LOCKED) UPDATE in_app_notifications n SET archived_at=now(),archived_by=$2,archive_batch_id=$3 FROM eligible e WHERE n.id=e.id`,[run.cutoffAt,actorUserId,run.id,settings.archiveBatchSize]);
  run.archivedCount=archived.rowCount??0;
  const eligibleRemaining=await countEligibleNotifications(client,settings.readRetentionDays);
  const summary={archivedCount:run.archivedCount,eligibleRemaining,source};
  await client.query(`UPDATE notification_archive_runs SET archived_count=$2 WHERE id=$1`,[run.id,run.archivedCount]);
  await client.query(`INSERT INTO notification_retention_settings(tenant_id,updated_by,last_archive_at,last_archive_key,last_archive_summary) VALUES($1,$2,now(),$3,$4::jsonb) ON CONFLICT(tenant_id) DO UPDATE SET last_archive_at=EXCLUDED.last_archive_at,last_archive_key=EXCLUDED.last_archive_key,last_archive_summary=EXCLUDED.last_archive_summary,updated_at=now()`,[tenantId,actorUserId,runKey,JSON.stringify(summary)]);
  await client.query(`INSERT INTO audit_events(tenant_id,actor_user_id,action,entity_type,entity_id,metadata) VALUES($1,$2,'notifications.archived','notification_archive_run',$3,$4::jsonb)`,[tenantId,actorUserId,run.id,JSON.stringify({...summary,retentionDays:settings.readRetentionDays,batchSize:settings.archiveBatchSize,runKey})]);
  return{skipped:false as const,run:{...run,cutoffAt:run.cutoffAt.toISOString(),createdAt:run.createdAt.toISOString()},summary,settings:await loadNotificationRetentionState(client)};
}
