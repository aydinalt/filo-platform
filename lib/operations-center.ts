import { assertPermission, runtimeEnv, type Workspace } from "./platform-store";

type Severity="CRITICAL"|"HIGH"|"MEDIUM";
type SignalRule={signal:string;severity:Severity;team:string;ackMinutes:number;escalationMinutes:number;runbook:string};

const RULES:Record<string,SignalRule>={
  APPLICATION_ERRORS:{signal:"APPLICATION_ERRORS",severity:"CRITICAL",team:"TEKNİK EKİP",ackMinutes:15,escalationMinutes:30,runbook:"/docs/operations/application-errors"},
  STALE_TELEMETRY:{signal:"STALE_TELEMETRY",severity:"HIGH",team:"TEKNİK EKİP",ackMinutes:15,escalationMinutes:30,runbook:"/docs/operations/stale-telemetry"},
  FAILED_WEBHOOKS:{signal:"FAILED_WEBHOOKS",severity:"HIGH",team:"OPERASYON",ackMinutes:30,escalationMinutes:60,runbook:"/docs/operations/provider-delivery"},
  FAILED_CRON:{signal:"FAILED_CRON",severity:"CRITICAL",team:"TEKNİK EKİP",ackMinutes:15,escalationMinutes:30,runbook:"/docs/operations/scheduler"},
  DATABASE_CAPACITY:{signal:"DATABASE_CAPACITY",severity:"HIGH",team:"TEKNİK EKİP",ackMinutes:30,escalationMinutes:60,runbook:"/docs/operations/capacity"},
  STORAGE_CAPACITY:{signal:"STORAGE_CAPACITY",severity:"HIGH",team:"TEKNİK EKİP",ackMinutes:30,escalationMinutes:60,runbook:"/docs/operations/capacity"},
  PROVIDER_OUTAGE:{signal:"PROVIDER_OUTAGE",severity:"HIGH",team:"OPERASYON",ackMinutes:15,escalationMinutes:30,runbook:"/docs/operations/provider-outage"},
  CAPACITY_METRICS_MISSING:{signal:"CAPACITY_METRICS_MISSING",severity:"MEDIUM",team:"TEKNİK EKİP",ackMinutes:60,escalationMinutes:120,runbook:"/docs/operations/capacity"},
  ALERT_ROUTING_MISSING:{signal:"ALERT_ROUTING_MISSING",severity:"CRITICAL",team:"PLATFORM OWNER",ackMinutes:15,escalationMinutes:30,runbook:"/docs/operations/alert-routing"},
};

const numberValue=(value:unknown,fallback=-1)=>{const parsed=Number(value);return Number.isFinite(parsed)?Math.round(parsed):fallback};
const isoAfter=(minutes:number)=>new Date(Date.now()+minutes*60_000).toISOString();
const cleanNote=(value:unknown,min=1)=>{const note=String(value||"").trim();if(note.length<min)throw new Response("İşlem açıklaması zorunludur.",{status:400});return note};
const alertRecipients=()=>String(runtimeEnv().OPERATIONS_ALERT_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter((value,index,list)=>/^\S+@\S+\.\S+$/.test(value)&&list.indexOf(value)===index).slice(0,10);

async function recordSignal(workspace:Workspace,rule:SignalRule,active:boolean,detail:string){
  const {DB}=runtimeEnv(),fingerprint=`${workspace.tenantId}:${rule.signal}`;
  if(!active){
    await DB.prepare("UPDATE monitoring_events SET status='RESOLVED',resolution_note='Sinyal normal aralığa döndü.',resolved_at=CURRENT_TIMESTAMP,last_detected_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND fingerprint=? AND status<>'RESOLVED'").bind(workspace.tenantId,fingerprint).run();
    return;
  }
  const existing=await DB.prepare("SELECT id FROM monitoring_events WHERE tenant_id=? AND fingerprint=? AND status<>'RESOLVED' ORDER BY detected_at DESC LIMIT 1").bind(workspace.tenantId,fingerprint).first<{id:string}>();
  if(existing){
    await DB.prepare("UPDATE monitoring_events SET occurrence_count=occurrence_count+1,last_detected_at=CURRENT_TIMESTAMP,detail=? WHERE tenant_id=? AND id=?").bind(detail,workspace.tenantId,existing.id).run();
    return;
  }
  const eventId=`MON-${crypto.randomUUID()}`,recipients=alertRecipients();
  await DB.batch([
    DB.prepare("INSERT INTO monitoring_events (id,tenant_id,source,signal,severity,status,detail,assigned_team,fingerprint,occurrence_count,first_detected_at,last_detected_at,acknowledge_due_at,escalation_due_at,runbook_url) VALUES (?,?,'OPERATIONS_CENTER',?,?,'OPEN',?,?,?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?,?)").bind(eventId,workspace.tenantId,rule.signal,rule.severity,detail,rule.team,fingerprint,isoAfter(rule.ackMinutes),isoAfter(rule.escalationMinutes),rule.runbook),
    ...recipients.map(email=>DB.prepare("INSERT INTO outbox_events (id,tenant_id,topic,payload) VALUES (?,?,'notifications.operations_alert',?)").bind(`OUT-${crypto.randomUUID()}`,workspace.tenantId,JSON.stringify({id:eventId,email,signal:rule.signal,severity:rule.severity,detail,team:rule.team,runbook:rule.runbook}))),
  ]);
}

export async function escalateDueMonitoringEvents(workspace:Workspace){
  const {DB}=runtimeEnv(),recipients=alertRecipients(),rows=await DB.prepare("SELECT id,signal,detail,assigned_team AS assignedTeam,severity,escalation_level AS escalationLevel,acknowledged_at AS acknowledgedAt,acknowledge_due_at AS acknowledgeDueAt,escalation_due_at AS escalationDueAt FROM monitoring_events WHERE tenant_id=? AND status<>'RESOLVED' AND ((acknowledged_at IS NULL AND acknowledge_due_at<=CURRENT_TIMESTAMP) OR escalation_due_at<=CURRENT_TIMESTAMP) ORDER BY detected_at").bind(workspace.tenantId).all<{id:string;signal:string;detail:string;assignedTeam:string;severity:string;escalationLevel:number;acknowledgedAt:string|null;acknowledgeDueAt:string|null;escalationDueAt:string|null}>();
  const statements=[];let escalated=0;
  for(const row of rows.results){
    const level=Math.min(3,Number(row.escalationLevel||0)+1),toTeam=level>=2?"PLATFORM OWNER":"NÖBETÇİ OPERASYON",reason=row.acknowledgedAt?"Çözüm süresi aşıldı":"Alarm onay süresi aşıldı";
    statements.push(DB.prepare("UPDATE monitoring_events SET status='ESCALATED',escalation_level=?,assigned_team=?,escalation_due_at=? WHERE tenant_id=? AND id=?").bind(level,toTeam,isoAfter(level>=2?15:30),workspace.tenantId,row.id));
    statements.push(DB.prepare("INSERT INTO monitoring_escalations (id,tenant_id,monitoring_event_id,level,from_team,to_team,reason,channel,delivery_status) VALUES (?,?,?,?,?,?,?,?,?)").bind(`ESC-${crypto.randomUUID()}`,workspace.tenantId,row.id,level,row.assignedTeam,toTeam,reason,recipients.length?"EMAIL_OUTBOX":"IN_APP",recipients.length?"QUEUED":"CONFIG_REQUIRED"));
    statements.push(...recipients.map(email=>DB.prepare("INSERT INTO outbox_events (id,tenant_id,topic,payload) VALUES (?,?,'notifications.operations_escalation',?)").bind(`OUT-${crypto.randomUUID()}`,workspace.tenantId,JSON.stringify({id:row.id,email,signal:row.signal,severity:row.severity,detail:row.detail,team:toTeam,level,reason}))));escalated++;
  }
  if(statements.length)await DB.batch(statements);
  return {escalated};
}

export async function runOperationsCenterSweep(workspace:Workspace){
  assertPermission(workspace,"provider");const {DB}=runtimeEnv(),env=runtimeEnv() as unknown as Record<string,unknown>;
  const [applicationErrors,staleTelemetry,failedWebhooks,failedCron,providers]=await Promise.all([
    DB.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE tenant_id=? AND action LIKE '%FAILED' AND action NOT IN ('OPERATIONS_SWEEP_FAILED','SCHEDULED_OPERATIONS_FAILED') AND action NOT LIKE 'MONITORING_%' AND created_at>=datetime('now','-15 minutes')").bind(workspace.tenantId).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM (SELECT vehicle_id FROM telemetry_events WHERE tenant_id=? GROUP BY vehicle_id HAVING (julianday('now')-julianday(MAX(received_at)))*86400>300)").bind(workspace.tenantId).first<{count:number}>(),
    DB.prepare("SELECT (SELECT COUNT(*) FROM provider_dispatches WHERE tenant_id=? AND status='FAILED')+(SELECT COUNT(*) FROM notification_deliveries WHERE tenant_id=? AND status='FAILED') AS count").bind(workspace.tenantId,workspace.tenantId).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM scheduled_jobs WHERE tenant_id=? AND status='FAILED' AND created_at>=datetime('now','-60 minutes')").bind(workspace.tenantId).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status<>'CONNECTED' THEN 1 ELSE 0 END) AS unavailable FROM provider_connections WHERE tenant_id=?").bind(workspace.tenantId).first<{total:number;unavailable:number}>(),
  ]);
  const metrics={
    applicationErrorCount:Number(applicationErrors?.count||0),staleTelemetryCount:Number(staleTelemetry?.count||0),failedWebhookCount:Number(failedWebhooks?.count||0),failedCronCount:Number(failedCron?.count||0),
    databaseCapacityPercent:numberValue(env.DATABASE_CAPACITY_USED_PERCENT),storageCapacityPercent:numberValue(env.STORAGE_CAPACITY_USED_PERCENT),unavailableProviderCount:Number(providers?.unavailable||0),providerTotal:Number(providers?.total||0),
  };
  const capacityMissing=metrics.databaseCapacityPercent<0||metrics.storageCapacityPercent<0;
  const routingMissing=alertRecipients().length===0;
  await recordSignal(workspace,RULES.APPLICATION_ERRORS,metrics.applicationErrorCount>0,`${metrics.applicationErrorCount} uygulama hatası / 15 dk`);
  await recordSignal(workspace,RULES.STALE_TELEMETRY,metrics.staleTelemetryCount>0,`${metrics.staleTelemetryCount} araçta 5 dakikayı aşan telemetri boşluğu`);
  await recordSignal(workspace,RULES.FAILED_WEBHOOKS,metrics.failedWebhookCount>0,`${metrics.failedWebhookCount} başarısız webhook/sağlayıcı teslimatı`);
  await recordSignal(workspace,RULES.FAILED_CRON,metrics.failedCronCount>0,`${metrics.failedCronCount} başarısız zamanlanmış iş / 60 dk`);
  await recordSignal(workspace,RULES.DATABASE_CAPACITY,metrics.databaseCapacityPercent>=80,`Veritabanı kapasitesi %${metrics.databaseCapacityPercent}`);
  await recordSignal(workspace,RULES.STORAGE_CAPACITY,metrics.storageCapacityPercent>=80,`Storage kapasitesi %${metrics.storageCapacityPercent}`);
  await recordSignal(workspace,RULES.PROVIDER_OUTAGE,metrics.unavailableProviderCount>0,`${metrics.unavailableProviderCount}/${metrics.providerTotal} sağlayıcı bağlı değil`);
  await recordSignal(workspace,RULES.CAPACITY_METRICS_MISSING,capacityMissing,"Canlı veritabanı veya Storage kapasite metriği yapılandırılmamış");
  await recordSignal(workspace,RULES.ALERT_ROUTING_MISSING,routingMissing,"OPERATIONS_ALERT_EMAILS içinde geçerli nöbetçi alıcısı yok");
  const escalation=await escalateDueMonitoringEvents(workspace),critical=await DB.prepare("SELECT COUNT(*) AS count FROM monitoring_events WHERE tenant_id=? AND severity='CRITICAL' AND status<>'RESOLVED'").bind(workspace.tenantId).first<{count:number}>(),openCriticalCount=Number(critical?.count||0),passed=metrics.applicationErrorCount===0&&metrics.failedCronCount===0&&metrics.failedWebhookCount===0&&metrics.staleTelemetryCount===0&&metrics.unavailableProviderCount===0&&!capacityMissing&&metrics.databaseCapacityPercent<80&&metrics.storageCapacityPercent<80&&openCriticalCount===0,id=`OPS-${crypto.randomUUID()}`;
  await DB.batch([
    DB.prepare("INSERT INTO operational_health_snapshots (id,tenant_id,status,application_error_count,stale_telemetry_count,failed_webhook_count,failed_cron_count,database_capacity_percent,storage_capacity_percent,unavailable_provider_count,open_critical_count,metrics_source) VALUES (?,?,?,?,?,?,?,?,?,?,?,'PROVIDER_AND_INTERNAL')").bind(id,workspace.tenantId,passed?"HEALTHY":"DEGRADED",metrics.applicationErrorCount,metrics.staleTelemetryCount,metrics.failedWebhookCount,metrics.failedCronCount,metrics.databaseCapacityPercent,metrics.storageCapacityPercent,metrics.unavailableProviderCount,openCriticalCount),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"OPERATIONS_SWEEP_PASSED":"OPERATIONS_SWEEP_FAILED","readiness",id,JSON.stringify({metrics,openCriticalCount,escalated:escalation.escalated})),
  ]);
  return {id,passed,status:passed?"HEALTHY":"DEGRADED",metrics,alertRecipientCount:alertRecipients().length,openCriticalCount,escalated:escalation.escalated,checkedAt:new Date().toISOString()};
}

export async function operationsCenterSnapshot(workspace:Workspace){
  assertPermission(workspace,"read");const {DB}=runtimeEnv();
  const [health,events,escalations]=await Promise.all([
    DB.prepare("SELECT id,status,application_error_count AS applicationErrorCount,stale_telemetry_count AS staleTelemetryCount,failed_webhook_count AS failedWebhookCount,failed_cron_count AS failedCronCount,database_capacity_percent AS databaseCapacityPercent,storage_capacity_percent AS storageCapacityPercent,unavailable_provider_count AS unavailableProviderCount,open_critical_count AS openCriticalCount,metrics_source AS metricsSource,checked_at AS checkedAt FROM operational_health_snapshots WHERE tenant_id=? ORDER BY checked_at DESC LIMIT 1").bind(workspace.tenantId).first(),
    DB.prepare("SELECT id,source,signal,severity,status,detail,assigned_team AS assignedTeam,assigned_owner AS assignedOwner,occurrence_count AS occurrenceCount,first_detected_at AS firstDetectedAt,last_detected_at AS lastDetectedAt,acknowledge_due_at AS acknowledgeDueAt,escalation_due_at AS escalationDueAt,escalation_level AS escalationLevel,runbook_url AS runbookUrl,resolution_note AS resolutionNote,acknowledged_at AS acknowledgedAt,resolved_at AS resolvedAt FROM monitoring_events WHERE tenant_id=? ORDER BY CASE status WHEN 'OPEN' THEN 0 WHEN 'ESCALATED' THEN 1 WHEN 'ACKNOWLEDGED' THEN 2 ELSE 3 END,last_detected_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,monitoring_event_id AS monitoringEventId,level,from_team AS fromTeam,to_team AS toTeam,reason,channel,delivery_status AS deliveryStatus,created_at AS createdAt FROM monitoring_escalations WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(workspace.tenantId).all(),
  ]);
  const checkedAt=String((health as {checkedAt?:string}|null)?.checkedAt||""),fresh=Boolean(checkedAt)&&Date.now()-Date.parse(checkedAt)<=20*60_000;
  return {release:"1.28.20",health:health||null,events:events.results,escalations:escalations.results,fresh,status:fresh&&health&&String((health as {status?:string}).status)==="HEALTHY"?"GO_FOR_OBSERVABILITY_GATE":"NO_GO"};
}

export async function acknowledgeMonitoringEvent(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"provider");const id=String(input.id||""),owner=cleanNote(input.owner,3),note=cleanNote(input.note,5),{DB}=runtimeEnv(),event=await DB.prepare("SELECT id,status FROM monitoring_events WHERE tenant_id=? AND id=?").bind(workspace.tenantId,id).first<{id:string;status:string}>();if(!event)throw new Response("Alarm bulunamadı.",{status:404});if(event.status==="RESOLVED")throw new Response("Çözülmüş alarm yeniden onaylanamaz.",{status:409});await DB.batch([DB.prepare("UPDATE monitoring_events SET status='ACKNOWLEDGED',assigned_owner=?,acknowledged_at=CURRENT_TIMESTAMP,detail=detail||' · '||? WHERE tenant_id=? AND id=?").bind(owner,note,workspace.tenantId,id),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'MONITORING_EVENT_ACKNOWLEDGED','readiness',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({owner,note}))]);return {id,status:"ACKNOWLEDGED",owner};
}

export async function resolveMonitoringEvent(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"provider");const id=String(input.id||""),note=cleanNote(input.note,10),{DB}=runtimeEnv(),result=await DB.prepare("UPDATE monitoring_events SET status='RESOLVED',resolution_note=?,resolved_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status<>'RESOLVED'").bind(note,workspace.tenantId,id).run();if(!result.meta.changes)throw new Response("Açık alarm bulunamadı.",{status:404});await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'MONITORING_EVENT_RESOLVED','readiness',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({note})).run();return {id,status:"RESOLVED"};
}
