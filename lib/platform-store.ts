import { getChatGPTUser } from "../app/chatgpt-auth";
import { legalProfileReadiness, platformLegalStatus, type LegalProfile } from "./legal-documents";
import { scanUploadedFileWithProvider } from "./security";
import { READINESS_GATES, READINESS_ORDER, type ReadinessGateId } from "./readiness-contract";
import { geocodingConfiguration } from "./map-geocoding";

type RuntimeEnv = { DB: D1Database; BUCKET: R2Bucket; APP_ENV?:string; ENVIRONMENT_ID?:string; PUBLIC_APP_ORIGIN?:string; RELEASE_VERSION?:string; FILO_RUNTIME?:string; D1_ENVIRONMENT_ID?:string; R2_ENVIRONMENT_ID?:string; NEXT_PUBLIC_SUPABASE_URL?:string; NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?:string; SUPABASE_SERVICE_ROLE_KEY?:string; SUPABASE_DATABASE_URL?:string; SUPABASE_STORAGE_BUCKET?:string; SUPABASE_CRON_MODE?:string; SECRETS_ROTATED_AT?:string; SECRET_ROTATION_OWNER?:string; SECRET_MAX_AGE_DAYS?:string; PAYMENT_API_URL?:string; PAYMENT_API_KEY?:string; PAYMENT_WEBHOOK_SECRET?:string; PAYMENT_PROVIDER_NAME?:string; PAYMENT_CHECKOUT_HOSTS?:string; ESIGN_API_KEY?:string; ESIGN_WEBHOOK_SECRET?:string; RESEND_API_KEY?:string; RESEND_WEBHOOK_SECRET?:string; RESEND_FROM?:string; EXPO_ACCESS_TOKEN?:string; EXPO_PROJECT_ID?:string; FCM_SERVER_KEY?:string; EINVOICE_API_URL?:string; EINVOICE_API_KEY?:string; EINVOICE_WEBHOOK_SECRET?:string; EINVOICE_PROVIDER_NAME?:string; LEGAL_CONTROLLER_NAME?:string; LEGAL_CONTROLLER_EMAIL?:string; LEGAL_CONTROLLER_ADDRESS?:string; LEGAL_TERMS_EFFECTIVE_AT?:string; PUBLIC_SIGNUP_ENABLED?:string; PRIVILEGED_MFA_REQUIRED?:string; BROWSER_TELEMETRY_ENABLED?:string; OPERATIONS_ALERT_EMAILS?:string; OPERATIONS_CRON_SECRET?:string; DATABASE_CAPACITY_USED_PERCENT?:string; STORAGE_CAPACITY_USED_PERCENT?:string; MALWARE_SCAN_PROVIDER?:string; CLOUDMERSIVE_API_KEY?:string; VEHICLE_CATALOG_PROVIDER?:string; VEHICLE_CATALOG_API_URL?:string; VEHICLE_CATALOG_API_KEY?:string; VEHICLE_CATALOG_ALLOWED_HOSTS?:string; TRACKER_GATEWAY_MODE?:string; DEVICE_TOKEN_MAX_AGE_DAYS?:string; MAP_PROVIDER?:string; MAP_ALLOWED_HOSTS?:string; MAP_GEOCODING_API_URL?:string; MAP_GEOCODING_API_KEY?:string; MAP_GEOCODING_ALLOWED_HOSTS?:string; PLATFORM_ADMIN_EMAILS?:string; FILO_DEMO_AUTH_ENABLED?:string; FILO_DEMO_SESSION_SECRET?:string };
type SignupAcceptance={contract:string;termsVersion:string;privacyVersion:string;acceptedAt:string};
type Identity = { email: string; name: string; authSource: "SITES_SIWC"|"SUPABASE"|"DEMO"; assuranceLevel: "aal1"|"aal2"|"workspace"|"demo"; signupAcceptance?:SignupAcceptance };
export type Workspace = { tenantId: string; tenantName: string; email: string; name: string; role: string; authSource: "SITES_SIWC"|"SUPABASE"|"DEMO"|"SYSTEM"; assuranceLevel: "aal1"|"aal2"|"workspace"|"demo"|"system" };
export type TenantEntitlements = { plan:string; memberLimit:number; activeMembers:number; availableMembers:number; vehicleLimit:number; activeVehicles:number; source:"FREE"|"PLAN"|"SUBSCRIPTION"|"DEMO_PURCHASE" };

const MODULES = new Set([
  "crm", "requests", "offers", "company", "entities", "fleet", "drivers", "operations",
  "routes", "geofences", "alerts", "maintenance", "expenses", "documents", "safety",
  "inspections", "tires", "incidents", "tasks", "notifications", "reports", "devices",
  "custody", "trackers", "security", "audit", "readiness",
]);
const OPERATOR_MODULES = new Set([
  "crm", "requests", "offers", "fleet", "drivers", "operations", "routes", "geofences",
  "alerts", "maintenance", "expenses", "documents", "safety", "inspections", "tires",
  "incidents", "tasks", "notifications", "devices", "custody", "trackers", "reports",
]);
const SYSTEM_ONLY_MODULES = new Set(["security", "audit"]);
const PLAN_LIMITS: Record<string, { members:number; vehicles:number }> = {
  FREE: { members:1, vehicles:1 }, STARTER: { members:5, vehicles:10 }, PROFESSIONAL: { members:25, vehicles:30 }, ENTERPRISE: { members:1000, vehicles:1000 },
};
const PROVIDER_DEFAULTS = [["RESEND","EMAIL"],["EXPO_FCM","PUSH"],["PAYMENT","BILLING"],["QUALIFIED_ESIGN","SIGNATURE"],["EINVOICE","ACCOUNTING"],["MALWARE_SCAN","SECURITY"],["DEVICE_TELEMETRY","TRACKING"],["TELTONIKA_GATEWAY","TRACKING"],["QUECLINK_GATEWAY","TRACKING"]] as const;
const PROVIDER_REQUIREMENTS:Record<string,{keys:string[];activation:string;callbackPath:string}>={
  RESEND:{keys:["RESEND_API_KEY","RESEND_WEBHOOK_SECRET","RESEND_FROM"],activation:"İmzalı teslimat geri bildirimi",callbackPath:"/api/resend-webhook"},
  EXPO_FCM:{keys:["EXPO_ACCESS_TOKEN","EXPO_PROJECT_ID"],activation:"Geçerli push bileti ve teslimat sonucu",callbackPath:"Expo bildirim makbuzu"},
  PAYMENT:{keys:["PAYMENT_API_URL","PAYMENT_API_KEY","PAYMENT_WEBHOOK_SECRET","PAYMENT_CHECKOUT_HOSTS"],activation:"İmzalı ödeme yaşam döngüsü callback'i",callbackPath:"/api/provider-callback?provider=PAYMENT"},
  QUALIFIED_ESIGN:{keys:["ESIGN_API_KEY","ESIGN_WEBHOOK_SECRET"],activation:"İmzalı e-imza sonucu ve belge özeti",callbackPath:"/api/provider-callback?provider=QUALIFIED_ESIGN"},
  EINVOICE:{keys:["EINVOICE_API_URL","EINVOICE_API_KEY","EINVOICE_WEBHOOK_SECRET"],activation:"İmzalı e-belge sonucu",callbackPath:"/api/provider-callback?provider=EINVOICE"},
  MALWARE_SCAN:{keys:["MALWARE_SCAN_PROVIDER","CLOUDMERSIVE_API_KEY"],activation:"Harici sağlayıcıdan gerçek temiz/karantina sonucu",callbackPath:"Senkron dosya yükleme taraması"},
  DEVICE_TELEMETRY:{keys:[],activation:"Yetkili cihazdan kabul edilmiş telemetri",callbackPath:"/api/device-telemetry"},
  TELTONIKA_GATEWAY:{keys:["ACTIVE_DEVICE_TOKEN"],activation:"İmzalı ve işlenmiş gerçek cihaz paketi",callbackPath:"/api/tracker-gateway"},
  QUECLINK_GATEWAY:{keys:["ACTIVE_DEVICE_TOKEN"],activation:"İmzalı ve işlenmiş gerçek cihaz paketi",callbackPath:"/api/tracker-gateway"},
};

function providerConfiguration(env:RuntimeEnv,tokenCounts:Record<string,number>={}){
  const envValues=env as unknown as Record<string,unknown>;
  return Object.fromEntries(Object.entries(PROVIDER_REQUIREMENTS).map(([provider,definition])=>{
    const missing=definition.keys.filter(key=>key==="ACTIVE_DEVICE_TOKEN"?!tokenCounts[provider]:key==="MALWARE_SCAN_PROVIDER"?String(envValues[key]||"").trim().toUpperCase()!=="CLOUDMERSIVE":!String(envValues[key]||"").trim());
    return [provider,{configured:missing.length===0,missing,activation:definition.activation,callbackPath:definition.callbackPath}];
  })) as Record<string,{configured:boolean;missing:string[];activation:string;callbackPath:string}>;
}
export function assertPermission(workspace: Workspace, action: "read"|"record"|"team"|"member"|"settings"|"billing"|"provider", moduleName?: string) {
  if (action === "read") return;
  if (workspace.role === "Owner") return;
  if (moduleName === "readiness") throw new Response("Üretim kanıtlarını yalnız çalışma alanı sahibi yönetebilir.", { status: 403 });
  if (action === "member" && workspace.role === "Admin") return;
  if (action === "team" && workspace.role === "Admin") return;
  if (action === "record" && workspace.role === "Admin" && !SYSTEM_ONLY_MODULES.has(moduleName || "")) return;
  if (action === "record" && workspace.role === "Operator" && OPERATOR_MODULES.has(moduleName || "")) return;
  throw new Response("Bu işlem rolünüz için yetkili değildir.", { status: 403 });
}

export function runtimeEnv(): RuntimeEnv {
  const bindings = (globalThis as typeof globalThis & { __FILO_ENV?: Partial<RuntimeEnv> }).__FILO_ENV;
  if (!bindings?.DB) throw new Error("Kalıcı veritabanı bağlantısı kullanılamıyor.");
  if (!bindings?.BUCKET) throw new Error("Dosya saklama bağlantısı kullanılamıyor.");
  return bindings as RuntimeEnv;
}

export async function requireIdentity(): Promise<Identity> {
  const user = await getChatGPTUser();
  if (!user?.email) throw new Response("Kimlik doğrulaması gerekli.", { status: 401 });
  return { email: user.email.toLowerCase(), name: user.fullName || user.displayName || user.email, authSource:user.authSource, assuranceLevel:user.assuranceLevel, signupAcceptance:user.signupAcceptance };
}

function defaultTenantName(email: string) {
  const domain = email.split("@")[1]?.split(".")[0] || "FILO";
  return `${domain.replace(/[-_]/g, " ").toLocaleUpperCase("tr-TR")} FİLO`;
}

async function ensureDemoWorkspaceRows(DB:D1Database) {
  const tenantId="TEN-DEMO";
  await DB.batch([
    DB.prepare("INSERT OR IGNORE INTO tenants (id,name,country,default_currency) VALUES (?,'FİLO DEMO FİLOSU','TR','TRY')").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO tenant_members (tenant_id,email,name,role,team,title,active,invite_status) VALUES (?,'demo1@demo.filo.local','DEMO YETKİLİ KULLANICI','Owner','OPERASYON','YETKİLİ KULLANICI',1,'ACTIVE')").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO tenant_members (tenant_id,email,name,role,team,title,active,invite_status) VALUES (?,'demo2@demo.filo.local','DEMO YETKİSİZ KULLANICI','Viewer','OPERASYON','DAVETLİ KULLANICI',0,'PENDING_LICENSE')").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO teams (id,tenant_id,name,manager,area,active) VALUES ('TEAM-DEMO-OPS',?,'OPERASYON','DEMO YETKİLİ KULLANICI','FİLO VE OPERASYON',1)").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO settings (tenant_id,key,value,updated_by) VALUES (?,'language','tr','system:demo')").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO settings (tenant_id,key,value,updated_by) VALUES (?,'plan','FREE','system:demo')").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO settings (tenant_id,key,value,updated_by) VALUES (?,'demoMode','true','system:demo')").bind(tenantId),
    DB.prepare("INSERT OR IGNORE INTO settings (tenant_id,key,value,updated_by) VALUES (?,'demoPurchasedSeats','0','system:demo')").bind(tenantId),
    ...PROVIDER_DEFAULTS.map(([provider,kind])=>DB.prepare("INSERT OR IGNORE INTO provider_connections (tenant_id,provider,kind,status) VALUES (?,?,?,'CONFIG_REQUIRED')").bind(tenantId,provider,kind)),
  ]);
}

export async function ensureWorkspace(identity: Identity): Promise<Workspace> {
  const { DB } = runtimeEnv();
  if(identity.authSource==="DEMO")await ensureDemoWorkspaceRows(DB);
  const existing = await DB.prepare(
    `SELECT tm.tenant_id AS tenantId, tm.role, tm.name, t.name AS tenantName
     FROM tenant_members tm JOIN tenants t ON t.id = tm.tenant_id
     WHERE lower(tm.email) = lower(?) AND tm.active = 1
     ORDER BY CASE tm.role WHEN 'Owner' THEN 0 WHEN 'Admin' THEN 1 WHEN 'Operator' THEN 2 ELSE 3 END, tm.updated_at DESC LIMIT 1`,
  ).bind(identity.email).first<{ tenantId: string; role: string; name: string; tenantName: string }>();

  if (existing) {
    await DB.batch([
      DB.prepare("UPDATE tenant_members SET name = ?, invite_status = 'ACTIVE', updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND lower(email) = lower(?)").bind(identity.name, existing.tenantId, identity.email),
      ...PROVIDER_DEFAULTS.map(([provider,kind]) => DB.prepare("INSERT OR IGNORE INTO provider_connections (tenant_id, provider, kind, status) VALUES (?, ?, ?, 'CONFIG_REQUIRED')").bind(existing.tenantId, provider, kind)),
    ]);
    return { tenantId: existing.tenantId, tenantName: existing.tenantName, email: identity.email, name: identity.name, role: existing.role, authSource:identity.authSource, assuranceLevel:identity.assuranceLevel };
  }

  const inactiveMembership=await DB.prepare("SELECT tenant_id AS tenantId,invite_status AS inviteStatus FROM tenant_members WHERE lower(email)=lower(?) AND active=0 ORDER BY updated_at DESC LIMIT 1").bind(identity.email).first<{tenantId:string;inviteStatus:string}>();
  if(inactiveMembership)throw Response.json({error:"Hesabınız yetkili kullanıcı tarafından henüz aktifleştirilmedi. Kullanıcı lisansı ve rol ataması tamamlandıktan sonra giriş yapabilirsiniz.",code:"ACCOUNT_INACTIVE",inviteStatus:inactiveMembership.inviteStatus},{status:403});

  if(identity.authSource==="DEMO"){
    throw new Response("Demo çalışma alanı kullanılamıyor.",{status:403});
  }

  const env=runtimeEnv(),signup=platformLegalStatus(env);
  if(!signup.ready||!signup.signupEnabled)throw new Response("Açık üyelik kapalıdır. Çalışma alanı sahibinden davet isteyin.",{status:403});
  if(String(env.APP_ENV||"").toLowerCase()==="production"&&identity.authSource!=="SUPABASE")throw new Response("Üretim ortamında yeni firma kaydı yalnızca doğrulanmış Supabase oturumu ile yapılabilir.",{status:403});
  if(identity.authSource==="SUPABASE"){
    const acceptance=identity.signupAcceptance,acceptedAt=Date.parse(String(acceptance?.acceptedAt||""));
    if(acceptance?.contract!=="FILO_PUBLIC_SIGNUP_V1"||acceptance.termsVersion!==signup.version||acceptance.privacyVersion!==signup.version||!Number.isFinite(acceptedAt)||acceptedAt>Date.now()+300000||Date.now()-acceptedAt>24*60*60*1000)throw new Response("Üyelik için güncel kullanım koşulları kabulü ve gizlilik bildirimi okuma kaydı doğrulanamadı.",{status:403});
  }

  const tenantId = `TEN-${crypto.randomUUID()}`;
  const tenantName = defaultTenantName(identity.email);
  const teamRows = [
    ["SATIŞ EKİBİ", "CRM, TALEP VE TEKLİFLER"],
    ["OPERASYON", "ATAMA, VARDİYA VE ROTALAR"],
    ["TEKNİK EKİP", "BAKIM, KONTROL VE CİHAZLAR"],
    ["FİNANS", "GİDERLER VE ONAYLAR"],
    ["UYUM & GÜVENLİK", "BELGELER, HASAR VE GÜVENLİK"],
  ];
  await DB.batch([
    DB.prepare("INSERT INTO tenants (id, name, country, default_currency) VALUES (?, ?, 'TR', 'TRY')").bind(tenantId, tenantName),
    DB.prepare("INSERT INTO tenant_members (tenant_id, email, name, role, title, active, invite_status) VALUES (?, ?, ?, 'Owner', 'PLATFORM OWNER', 1, 'ACTIVE')").bind(tenantId, identity.email, identity.name),
    ...teamRows.map(([name, area]) => DB.prepare("INSERT INTO teams (id, tenant_id, name, manager, area, active) VALUES (?, ?, ?, ?, ?, 1)").bind(`TEAM-${crypto.randomUUID()}`, tenantId, name, identity.name, area)),
    DB.prepare("INSERT INTO settings (tenant_id, key, value, updated_by) VALUES (?, 'language', 'tr', ?)").bind(tenantId, identity.email),
    DB.prepare("INSERT INTO settings (tenant_id, key, value, updated_by) VALUES (?, 'distanceUnit', 'KM', ?)").bind(tenantId, identity.email),
    DB.prepare("INSERT INTO settings (tenant_id, key, value, updated_by) VALUES (?, 'timezone', 'Europe/Istanbul', ?)").bind(tenantId, identity.email),
    DB.prepare("INSERT INTO settings (tenant_id, key, value, updated_by) VALUES (?, 'plan', 'FREE', ?)").bind(tenantId, identity.email),
    DB.prepare("INSERT INTO settings (tenant_id, key, value, updated_by) VALUES (?, 'demoMode', 'false', ?)").bind(tenantId, identity.email),
    DB.prepare("INSERT INTO legal_profiles (tenant_id, controller_name, contact_email, updated_by) VALUES (?, ?, ?, ?)").bind(tenantId,tenantName,identity.email,identity.email),
    ...(identity.signupAcceptance?[
      DB.prepare("INSERT OR IGNORE INTO consent_events (id,tenant_id,actor_email,document_key,document_version,locale,evidence) VALUES (?,?,?,?,?,'tr-TR',?)").bind(`CNS-${crypto.randomUUID()}`,tenantId,identity.email,"TERMS_OF_SERVICE",identity.signupAcceptance.termsVersion,JSON.stringify({source:"SUPABASE_SIGNUP_METADATA",contract:identity.signupAcceptance.contract,acceptedAt:identity.signupAcceptance.acceptedAt})),
      DB.prepare("INSERT OR IGNORE INTO consent_events (id,tenant_id,actor_email,document_key,document_version,locale,evidence) VALUES (?,?,?,?,?,'tr-TR',?)").bind(`CNS-${crypto.randomUUID()}`,tenantId,identity.email,"PRIVACY_NOTICE_ACKNOWLEDGED",identity.signupAcceptance.privacyVersion,JSON.stringify({source:"SUPABASE_SIGNUP_METADATA",contract:identity.signupAcceptance.contract,acceptedAt:identity.signupAcceptance.acceptedAt})),
    ]:[]),
    ...PROVIDER_DEFAULTS.map(([provider,kind]) => DB.prepare("INSERT INTO provider_connections (tenant_id, provider, kind, status) VALUES (?, ?, ?, 'CONFIG_REQUIRED')").bind(tenantId, provider, kind)),
  ]);
  return { tenantId, tenantName, email: identity.email, name: identity.name, role: "Owner", authSource:identity.authSource, assuranceLevel:identity.assuranceLevel };
}

export async function requireWorkspace(write = false): Promise<Workspace> {
  void write;
  const workspace = await ensureWorkspace(await requireIdentity());
  return workspace;
}

export async function requirePrivilegedAccess(workspace:Workspace,action:string){
  const env=runtimeEnv();
  const required=String(env.PRIVILEGED_MFA_REQUIRED||"").toLowerCase()==="true"||(String(env.FILO_RUNTIME||"").toLowerCase()==="supabase"&&String(env.APP_ENV||"").toLowerCase()==="production");
  if(!required)return;
  const demoRealm=workspace.authSource==="DEMO"&&workspace.tenantId==="TEN-DEMO";
  const allowed=demoRealm||(workspace.authSource==="SUPABASE"&&workspace.assuranceLevel==="aal2");
  await env.DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)")
    .bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,allowed?(demoRealm?"DEMO_PRIVILEGED_ACTION_AUTHORIZED":"PRIVILEGED_ACTION_AUTHORIZED"):"PRIVILEGED_ACTION_DENIED","security",action,JSON.stringify({action,authSource:workspace.authSource,assuranceLevel:workspace.assuranceLevel,required:demoRealm?"isolated-demo":"aal2"})).run();
  if(!allowed)throw Response.json({error:"Bu kritik işlem için Supabase MFA ile AAL2 doğrulaması gereklidir.",code:"MFA_REQUIRED",mfaUrl:"/security/mfa"},{status:428});
}

export async function workspaceSnapshot(workspace: Workspace) {
  const env=runtimeEnv(),{ DB } = env;
  const entitlements=await tenantEntitlements(workspace);
  const [records, teams, members, settingsRows, tickets, audit, links, files, telemetry, providers, subscriptions, signatures, outbox,legalProfile,mobileInstallations,trackingSessions,gatewayEvents,providerDispatches,eDocuments,notificationDeliveries,migrationRuns,monitoringEvents,restoreRehearsals,securityTestRuns,securityFindings,pilotRuns,pilotScenarios,mobileReleases,fieldValidationRuns,dataAcceptanceRuns,productionRollouts,e2eAcceptanceRuns,catalogVersions,catalogEntries,vinDecodeEvents,operationsControls,operationsReadinessRuns,taxVersions,taxEntries,gatewayTokenCounts] = await Promise.all([
    DB.prepare("SELECT id, module, status, data, version, created_at AS createdAt, updated_at AS updatedAt FROM module_records WHERE tenant_id = ? AND archived = 0 ORDER BY updated_at DESC LIMIT 1000").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, name, manager, area, active, updated_at AS updatedAt FROM teams WHERE tenant_id = ? ORDER BY name").bind(workspace.tenantId).all(),
    DB.prepare("SELECT email, name, role, team, title, active, invite_status AS inviteStatus, updated_at AS updatedAt FROM tenant_members WHERE tenant_id = ? ORDER BY name").bind(workspace.tenantId).all(),
    DB.prepare("SELECT key, value FROM settings WHERE tenant_id = ?").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, module, page_area AS pageArea, type, priority, description, reference, status, created_at AS createdAt FROM support_tickets WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, actor_email AS actorEmail, action, module, record_id AS recordId, payload, created_at AS createdAt FROM audit_events WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, from_module AS fromModule, from_id AS fromId, to_module AS toModule, to_id AS toId, relation, created_at AS createdAt FROM record_links WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, module, record_id AS recordId, file_name AS fileName, content_type AS contentType, size, sha256, scan_status AS scanStatus, scan_engine AS scanEngine, scan_summary AS scanSummary, created_at AS createdAt FROM file_objects WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 200").bind(workspace.tenantId).all(),
    DB.prepare("SELECT vehicle_id AS vehicleId, device_id AS deviceId, latitude, longitude, speed, battery, source, provider, event_type AS eventType, sequence, accuracy, altitude, heading, session_id AS sessionId, captured_at AS capturedAt, received_at AS receivedAt, MAX(0, CAST((julianday('now') - julianday(captured_at)) * 86400 AS INTEGER)) AS ageSeconds FROM telemetry_events WHERE tenant_id = ? ORDER BY captured_at DESC LIMIT 500").bind(workspace.tenantId).all(),
    DB.prepare("SELECT provider, kind, status, last_check_at AS lastCheckAt, updated_at AS updatedAt FROM provider_connections WHERE tenant_id = ? ORDER BY kind").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, plan, period, seats, vehicles, amount_minor AS amountMinor, currency, status, provider_reference AS providerReference, checkout_url AS checkoutUrl, failure_code AS failureCode, created_at AS createdAt FROM subscription_orders WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 20").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id, custody_record_id AS custodyRecordId, method, provider, status, document_digest AS documentDigest, evidence_file_id AS evidenceFileId, updated_at AS updatedAt FROM signature_requests WHERE tenant_id = ? ORDER BY updated_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT status, COUNT(*) AS count FROM outbox_events WHERE tenant_id = ? GROUP BY status").bind(workspace.tenantId).all(),
    DB.prepare("SELECT controller_name AS controllerName,tax_id AS taxId,address,contact_email AS contactEmail,dpo_contact AS dpoContact,jurisdictions,employee_legal_basis AS employeeLegalBasis,location_purposes AS locationPurposes,retention_days AS retentionDays,periodic_destruction_months AS periodicDestructionMonths,subprocessors,status,approved_by AS approvedBy,approved_at AS approvedAt,legal_opinion_reference AS legalOpinionReference,policy_version AS policyVersion,updated_at AS updatedAt FROM legal_profiles WHERE tenant_id=?").bind(workspace.tenantId).first(),
    DB.prepare("SELECT id,device_id AS deviceId,driver_id AS driverId,platform,os_version AS osVersion,app_version AS appVersion,device_model AS deviceModel,foreground_permission AS foregroundPermission,background_permission AS backgroundPermission,foreground_service AS foregroundService,battery_optimization AS batteryOptimization,notification_permission AS notificationPermission,push_token_status AS pushTokenStatus,status,last_heartbeat_at AS lastHeartbeatAt,updated_at AS updatedAt FROM mobile_installations WHERE tenant_id=? ORDER BY updated_at DESC").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,device_id AS deviceId,vehicle_id AS vehicleId,driver_id AS driverId,source,provider,status,permission_snapshot AS permissionSnapshot,started_at AS startedAt,last_seen_at AS lastSeenAt,ended_at AS endedAt FROM tracking_sessions WHERE tenant_id=? ORDER BY started_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,device_id AS deviceId,provider,protocol,external_message_id AS externalMessageId,record_count AS recordCount,status,received_at AS receivedAt FROM tracker_gateway_events WHERE tenant_id=? ORDER BY received_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,provider,kind,record_id AS recordId,status,attempts,provider_reference AS providerReference,response_code AS responseCode,next_attempt_at AS nextAttemptAt,last_error AS lastError,created_at AS createdAt,updated_at AS updatedAt FROM provider_dispatches WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,source_module AS sourceModule,source_record_id AS sourceRecordId,document_type AS documentType,currency,net_minor AS netMinor,tax_minor AS taxMinor,gross_minor AS grossMinor,status,provider_reference AS providerReference,failure_code AS failureCode,issued_at AS issuedAt,created_at AS createdAt,updated_at AS updatedAt FROM e_documents WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,outbox_event_id AS outboxEventId,channel,recipient,template_key AS templateKey,status,provider_reference AS providerReference,attempts,next_attempt_at AS nextAttemptAt,last_error AS lastError,sent_at AS sentAt,delivered_at AS deliveredAt,created_at AS createdAt,updated_at AS updatedAt FROM notification_deliveries WHERE tenant_id=? ORDER BY updated_at DESC LIMIT 200").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,module,source_sha256 AS sourceSha256,status,total,imported,errors,duplicates,record_ids AS recordIds,created_by AS createdBy,created_at AS createdAt,rolled_back_at AS rolledBackAt FROM migration_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,source,signal,severity,status,detail,assigned_team AS assignedTeam,detected_at AS detectedAt,acknowledged_at AS acknowledgedAt,resolved_at AS resolvedAt FROM monitoring_events WHERE tenant_id=? ORDER BY detected_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,backup_sha256 AS backupSha256,source_exported_at AS sourceExportedAt,status,record_count AS recordCount,file_count AS fileCount,rpo_minutes AS rpoMinutes,rto_seconds AS rtoSeconds,target_namespace AS targetNamespace,created_by AS createdBy,created_at AS createdAt FROM restore_rehearsals WHERE tenant_id=? ORDER BY created_at DESC LIMIT 20").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,tool,scope,status,concurrency,p95_ms AS p95Ms,p99_ms AS p99Ms,error_rate_bps AS errorRateBps,critical_count AS criticalCount,high_count AS highCount,external_auditor AS externalAuditor,report_file_id AS reportFileId,report_sha256 AS reportSha256,executed_at AS executedAt,created_by AS createdBy,created_at AS createdAt FROM security_test_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,run_id AS runId,severity,title,status,owner,remediation,due_date AS dueDate,verified_at AS verifiedAt,created_at AS createdAt FROM security_findings WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,name,status,company_count AS companyCount,vehicle_count AS vehicleCount,customer_approver AS customerApprover,platform_approver AS platformApprover,customer_approved_at AS customerApprovedAt,platform_approved_at AS platformApprovedAt,evidence_file_id AS evidenceFileId,created_by AS createdBy,created_at AS createdAt FROM pilot_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 30").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,pilot_run_id AS pilotRunId,code,expected_result AS expectedResult,actual_result AS actualResult,status,blocker_severity AS blockerSeverity,executed_at AS executedAt FROM pilot_scenarios WHERE tenant_id=? ORDER BY executed_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,platform,version,build_number AS buildNumber,bundle_id AS bundleId,store_status AS storeStatus,store_review_id AS storeReviewId,signing_status AS signingStatus,background_location_status AS backgroundLocationStatus,data_safety_status AS dataSafetyStatus,privacy_url AS privacyUrl,support_url AS supportUrl,account_deletion_url AS accountDeletionUrl,rollback_plan AS rollbackPlan,evidence_file_id AS evidenceFileId,evidence_sha256 AS evidenceSha256,created_by AS createdBy,created_at AS createdAt FROM mobile_releases WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,kind,device_id AS deviceId,platform,manufacturer,model,os_version AS osVersion,provider,protocol,scenario,expected_outcome AS expectedOutcome,observed_outcome AS observedOutcome,started_at AS startedAt,ended_at AS endedAt,duration_minutes AS durationMinutes,telemetry_count AS telemetryCount,gateway_event_count AS gatewayEventCount,max_gap_seconds AS maxGapSeconds,battery_drop_percent AS batteryDropPercent,crash_count AS crashCount,permission_loss_count AS permissionLossCount,runtime_event_count AS runtimeEventCount,offline_queue_count AS offlineQueueCount,flushed_count AS flushedCount,late_telemetry_count AS lateTelemetryCount,battery_sample_count AS batterySampleCount,status,evidence_file_id AS evidenceFileId,evidence_sha256 AS evidenceSha256,created_by AS createdBy,created_at AS createdAt FROM field_validation_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,migration_run_id AS migrationRunId,rollback_run_id AS rollbackRunId,module,source_sha256 AS sourceSha256,source_total AS sourceTotal,imported,errors,duplicates,persisted_count AS persistedCount,sample_size AS sampleSize,reconciliation_status AS reconciliationStatus,status,customer_approver AS customerApprover,evidence_file_id AS evidenceFileId,evidence_sha256 AS evidenceSha256,executed_at AS executedAt,created_by AS createdBy,created_at AS createdAt FROM data_acceptance_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,phase,target_percent AS targetPercent,status,started_at AS startedAt,ended_at AS endedAt,duration_minutes AS durationMinutes,readiness_passed AS readinessPassed,readiness_total AS readinessTotal,connected_providers AS connectedProviders,provider_total AS providerTotal,critical_incident_count AS criticalIncidentCount,pending_outbox_count AS pendingOutboxCount,stale_telemetry_count AS staleTelemetryCount,owner_approver AS ownerApprover,operations_approver AS operationsApprover,rollback_plan AS rollbackPlan,rollback_triggered AS rollbackTriggered,evidence_file_id AS evidenceFileId,evidence_sha256 AS evidenceSha256,created_by AS createdBy,created_at AS createdAt FROM production_rollouts WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,environment,base_url AS baseUrl,runner,browser,api_total AS apiTotal,api_passed AS apiPassed,role_total AS roleTotal,role_passed AS rolePassed,tenant_total AS tenantTotal,tenant_passed AS tenantPassed,browser_total AS browserTotal,browser_passed AS browserPassed,failed_count AS failedCount,status,commit_sha AS commitSha,evidence_file_id AS evidenceFileId,evidence_sha256 AS evidenceSha256,executed_at AS executedAt,created_by AS createdBy,created_at AS createdAt FROM e2e_acceptance_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,version,source,market,status,entry_count AS entryCount,source_sha256 AS sourceSha256,published_by AS publishedBy,published_at AS publishedAt FROM vehicle_catalog_versions WHERE tenant_id=? ORDER BY published_at DESC LIMIT 30").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,version_id AS versionId,make,model,year_from AS yearFrom,year_to AS yearTo,market,body_type AS bodyType,fuel_type AS fuelType,external_code AS externalCode,active FROM vehicle_catalog_entries WHERE tenant_id=? AND active=1 ORDER BY make,model LIMIT 3000").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,vin,provider,status,make,model,model_year AS modelYear,market,response_digest AS responseDigest,created_by AS createdBy,created_at AS createdAt FROM vin_decode_events WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,kind,name,owner_team AS ownerTeam,schedule,target_minutes AS targetMinutes,escalation_minutes AS escalationMinutes,retention_days AS retentionDays,runbook_url AS runbookUrl,active,updated_by AS updatedBy,updated_at AS updatedAt FROM operations_controls WHERE tenant_id=? ORDER BY kind,name").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,status,active_controls AS activeControls,required_controls AS requiredControls,open_critical_alerts AS openCriticalAlerts,restore_age_days AS restoreAgeDays,on_call_owner AS onCallOwner,evidence_file_id AS evidenceFileId,evidence_sha256 AS evidenceSha256,executed_at AS executedAt,created_by AS createdBy,created_at AS createdAt FROM operations_readiness_runs WHERE tenant_id=? ORDER BY created_at DESC LIMIT 50").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,version,source,status,entry_count AS entryCount,source_sha256 AS sourceSha256,published_by AS publishedBy,published_at AS publishedAt FROM tax_profile_versions WHERE tenant_id=? ORDER BY published_at DESC LIMIT 30").bind(workspace.tenantId).all(),
    DB.prepare("SELECT id,version_id AS versionId,country_code AS countryCode,region_code AS regionCode,label,currency,tax_name AS taxName,rate_bps AS rateBps,category,document_types AS documentTypes,reverse_charge AS reverseCharge,effective_from AS effectiveFrom,effective_to AS effectiveTo,source_url AS sourceUrl,active FROM tax_profile_entries WHERE tenant_id=? AND active=1 ORDER BY country_code,region_code,label LIMIT 1000").bind(workspace.tenantId).all(),
    DB.prepare("SELECT provider,COUNT(*) AS count FROM device_ingest_tokens WHERE tenant_id=? AND active=1 AND expires_at>CURRENT_TIMESTAMP GROUP BY provider").bind(workspace.tenantId).all<{provider:string;count:number}>(),
  ]);
  const settings = Object.fromEntries((settingsRows.results as Array<{ key: string; value: string }>).map(row => [row.key, row.value]));
  const tokenCounts=Object.fromEntries(gatewayTokenCounts.results.map(row=>[row.provider+"_GATEWAY",Number(row.count)]));
  const providerConfig=providerConfiguration(env,tokenCounts);
  return {
    workspace:{...workspace,isPlatformAdmin:isPlatformAdminEmail(workspace.email,env)},
    entitlements,
    records: (records.results as Array<Record<string, unknown>>).map(row => ({ ...row, data: JSON.parse(String(row.data || "{}")) })),
    teams: teams.results,
    members: members.results,
    settings,
    tickets: tickets.results,
    audit: (audit.results as Array<Record<string, unknown>>).map(row => ({ ...row, payload: JSON.parse(String(row.payload || "{}")) })),
    links: links.results,
    files: files.results,
    telemetry: telemetry.results,
    providers: (providers.results as Array<Record<string,unknown>>).map(row=>({...row,...providerConfig[String(row.provider)]})),
    subscriptions: subscriptions.results,
    signatures: signatures.results,
    outbox: outbox.results,
    legalProfile: legalProfile||{controllerName:workspace.tenantName,taxId:"",address:"",contactEmail:workspace.email,dpoContact:"",jurisdictions:"",employeeLegalBasis:"",locationPurposes:"",retentionDays:0,periodicDestructionMonths:0,subprocessors:"",status:"LEGAL_REVIEW_REQUIRED",approvedBy:"",approvedAt:"",legalOpinionReference:"",policyVersion:""},
    mobileInstallations: mobileInstallations.results,
    trackingSessions: (trackingSessions.results as Array<Record<string,unknown>>).map(row=>({...row,permissionSnapshot:JSON.parse(String(row.permissionSnapshot||"{}"))})),
    gatewayEvents: gatewayEvents.results,
    providerDispatches: providerDispatches.results,
    eDocuments: eDocuments.results,
    notificationDeliveries: notificationDeliveries.results,
    migrationRuns: (migrationRuns.results as Array<Record<string,unknown>>).map(row=>({...row,recordIds:JSON.parse(String(row.recordIds||"[]"))})),
    monitoringEvents: monitoringEvents.results,
    restoreRehearsals: restoreRehearsals.results,
    securityTestRuns: securityTestRuns.results,
    securityFindings: securityFindings.results,
    pilotRuns: pilotRuns.results,
    pilotScenarios: pilotScenarios.results,
    mobileReleases: mobileReleases.results,
    fieldValidationRuns: fieldValidationRuns.results,
    dataAcceptanceRuns: dataAcceptanceRuns.results,
    productionRollouts: productionRollouts.results,
    e2eAcceptanceRuns: e2eAcceptanceRuns.results,
    catalogVersions: catalogVersions.results,
    catalogEntries: catalogEntries.results,
    vinDecodeEvents: vinDecodeEvents.results,
    operationsControls: operationsControls.results,
    operationsReadinessRuns: operationsReadinessRuns.results,
    taxProfileVersions: taxVersions.results,
    taxProfileEntries: (taxEntries.results as Array<Record<string,unknown>>).map(row=>({...row,documentTypes:JSON.parse(String(row.documentTypes||"[]"))})),
    platformLegal: platformLegalStatus(env),
  };
}

function initialStatusFor(module: string, data: Record<string, unknown>) {
  if (module === "requests") return "YENİ";
  if (module === "offers") return "TASLAK";
  if (module === "operations") return "PLANLI";
  if (module === "custody") return String(data.workflowStatus || "TASLAK");
  return String(data.status || data.stage || "AKTİF").toLocaleUpperCase("tr-TR");
}

function stringValue(data: Record<string, unknown>, key: string) { return String(data[key] || "").trim(); }

function normalizeRecordData(input:Record<string,unknown>){
  const preserve=new Set(["potential","quantity","unitPrice","year","mileage","amount","cost","damage","heartbeat","phone","phoneNumber","imei","iccid","startTime","endTime"]);
  return Object.fromEntries(Object.entries(input).map(([key,value])=>{if(typeof value!=="string")return [key,value];const clean=value.trim();if(key==="_sourceModule"||key.toLowerCase().includes("email")||key.toLowerCase().includes("url"))return [key,clean.toLowerCase()];if(key.startsWith("_")||preserve.has(key)||/date|until|expiry/i.test(key))return [key,clean];return [key,clean.toLocaleUpperCase("tr-TR")]}));
}

export function isPlatformAdminEmail(email:string,env:Pick<RuntimeEnv,"PLATFORM_ADMIN_EMAILS">=runtimeEnv()):boolean{
  const allowed=String(env.PLATFORM_ADMIN_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter(Boolean);
  return allowed.includes(email.trim().toLowerCase());
}

export async function tenantEntitlements(workspace:Workspace):Promise<TenantEntitlements>{
  const {DB}=runtimeEnv();
  return tenantEntitlementsFor(DB,workspace.tenantId);
}

export async function tenantEntitlementsFor(DB:D1Database,tenantId:string):Promise<TenantEntitlements>{
  const [planRow,order,demoSeatsRow,memberCount,vehicleCount]=await Promise.all([
    DB.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='plan'").bind(tenantId).first<{value:string}>(),
    DB.prepare("SELECT plan,seats,vehicles FROM subscription_orders WHERE tenant_id=? AND status='COMPLETED' ORDER BY updated_at DESC LIMIT 1").bind(tenantId).first<{plan:string;seats:number;vehicles:number}>(),
    DB.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='demoPurchasedSeats'").bind(tenantId).first<{value:string}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM tenant_members WHERE tenant_id=? AND active=1").bind(tenantId).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0").bind(tenantId).first<{count:number}>(),
  ]);
  const plan=String(order?.plan||planRow?.value||"FREE").toUpperCase();
  const defaults=PLAN_LIMITS[plan]||PLAN_LIMITS.FREE;
  const demoExtra=tenantId==="TEN-DEMO"?Math.max(0,Number(demoSeatsRow?.value||0)):0;
  const memberLimit=order?Math.max(1,Number(order.seats)):defaults.members+demoExtra;
  const vehicleLimit=order?Math.max(1,Number(order.vehicles)):defaults.vehicles;
  const activeMembers=Number(memberCount?.count||0),activeVehicles=Number(vehicleCount?.count||0);
  return {plan,memberLimit,activeMembers,availableMembers:Math.max(0,memberLimit-activeMembers),vehicleLimit,activeVehicles,source:order?"SUBSCRIPTION":demoExtra?"DEMO_PURCHASE":plan==="FREE"?"FREE":"PLAN"};
}

async function enforcePlanLimit(workspace:Workspace, moduleName:string) {
  const limits=await tenantEntitlements(workspace); const plan=limits.plan; const {DB}=runtimeEnv();
  if(moduleName==="fleet"){
    const row=await DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id = ? AND module = 'fleet' AND archived = 0").bind(workspace.tenantId).first<{count:number}>();
    if(Number(row?.count||0)>=limits.vehicleLimit)throw new Response(`${plan} paketinde araç sınırı ${limits.vehicleLimit}. Paket yükseltmeden yeni araç eklenemez.`,{status:409});
  }
}

async function validateReadinessCompletion(workspace:Workspace,data:Record<string,unknown>,editingId?:string){
  const key=stringValue(data,"checkKey").toLocaleUpperCase("tr-TR");
  const status=stringValue(data,"status").toLocaleUpperCase("tr-TR");
  if(!READINESS_ORDER.includes(key as ReadinessGateId))throw new Response("Tanımsız üretim hazırlığı kapısı.",{status:400});
  if(editingId&&editingId!==key)throw new Response("Kanıt anahtarı kayıt kimliğiyle eşleşmiyor.",{status:409});
  if(status!=="BAŞARILI")return;
  const {DB}=runtimeEnv();
  const currentIndex=READINESS_ORDER.indexOf(key as ReadinessGateId);
  if(currentIndex>0){
    const previousKey=READINESS_ORDER[currentIndex-1];
    const previous=await DB.prepare("SELECT status FROM module_records WHERE tenant_id=? AND module='readiness' AND id=? AND archived=0").bind(workspace.tenantId,previousKey).first<{status:string}>();
    if(previous?.status!=="BAŞARILI")throw new Response(`Önce ${previousKey} kapısı kanıtla kapatılmalıdır.`,{status:409});
  }
  const evidence=await DB.prepare("SELECT COUNT(*) AS count FROM file_objects WHERE tenant_id=? AND module='readiness' AND record_id=? AND scan_status='CLEAN' AND length(sha256)=64").bind(workspace.tenantId,key).first<{count:number}>();
  if(Number(evidence?.count||0)<1)throw new Response("BAŞARILI sonucu için temiz taramadan geçmiş ve SHA-256 özeti bulunan kanıt zorunludur.",{status:409});
  const environment=stringValue(data,"environment").toLocaleUpperCase("tr-TR");
  const executedAt=Date.parse(stringValue(data,"executedAt")),gate=READINESS_GATES.find(item=>item.id===key);
  if(!Number.isFinite(executedAt)||executedAt>Date.now()+300000)throw new Response("Kapı tarihi geçmiş veya şu an olmalı; gelecekteki test kanıtı kabul edilmez.",{status:409});
  if(gate&&Date.now()-executedAt>gate.freshnessDays*86400000)throw new Response(`${gate.name} kanıtı ${gate.freshnessDays} günden eski olamaz.`,{status:409});
  if(key==="RDY-MOBILE-IOS-KILLED"&&(!environment.includes("IOS")||!/(IPHONE|IPAD)/.test(environment)))throw new Response("iOS kapısı için fiziksel IPHONE/IPAD ve IOS sürümü test ortamına yazılmalıdır.",{status:409});
  if(key==="RDY-MOBILE-ANDROID-OEM"&&(!environment.includes("ANDROID")||!/(SAMSUNG|XIAOMI|OPPO|VIVO|HUAWEI|HONOR|PIXEL)/.test(environment)))throw new Response("Android kapısı için ANDROID sürümü ve test edilen gerçek OEM/cihaz test ortamına yazılmalıdır.",{status:409});
  if(key==="RDY-MOBILE-IOS-KILLED"||key==="RDY-MOBILE-ANDROID-OEM"){
    const platform=key==="RDY-MOBILE-IOS-KILLED"?"IOS":"ANDROID";
    const installation=await DB.prepare("SELECT id FROM mobile_installations WHERE tenant_id=? AND platform=? AND status='REGISTERED' ORDER BY last_heartbeat_at DESC LIMIT 1").bind(workspace.tenantId,platform).first();
    if(!installation)throw new Response(`${platform} kapısı için kayıtlı fiziksel mobil kurulum bulunmalıdır.`,{status:409});
    const session=await DB.prepare("SELECT id FROM tracking_sessions WHERE tenant_id=? AND source='MOBILE' AND status IN ('ACTIVE','ENDED') ORDER BY started_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!session)throw new Response("Mobil kapı için izinleri doğrulanmış gerçek takip oturumu bulunmalıdır.",{status:409});
    const telemetry=await DB.prepare("SELECT id FROM telemetry_events WHERE tenant_id=? AND source='MOBILE' AND session_id<>'' ORDER BY captured_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!telemetry)throw new Response("Mobil kapı için takip oturumuna bağlı kalıcı konum kanıtı bulunmalıdır.",{status:409});
    if(platform==="IOS"){
      const coverage=await DB.prepare("SELECT COUNT(DISTINCT os_version) AS count FROM field_validation_runs WHERE tenant_id=? AND kind='MOBILE' AND platform='IOS' AND scenario='KILLED_APP' AND status='PASSED'").bind(workspace.tenantId).first<{count:number}>();
      if(Number(coverage?.count||0)<3)throw new Response("iOS kapısı için son üç ana iOS sürümünde fiziksel KILLED_APP saha sonucu kaydedilmelidir.",{status:409});
    }else{
      const coverage=await DB.prepare("SELECT COUNT(DISTINCT manufacturer) AS count FROM field_validation_runs WHERE tenant_id=? AND kind='MOBILE' AND platform='ANDROID' AND manufacturer IN ('SAMSUNG','XIAOMI','OPPO','PIXEL') AND status='PASSED'").bind(workspace.tenantId).first<{count:number}>();
      if(Number(coverage?.count||0)!==4)throw new Response("Android kapısı için Samsung, Xiaomi, Oppo ve Pixel fiziksel saha sonuçlarının tamamı geçmelidir.",{status:409});
    }
  }
  if(key==="RDY-TRACKER-LIVE"){
    const accepted=await DB.prepare("SELECT provider,device_id AS deviceId FROM tracker_gateway_events WHERE tenant_id=? AND status='PROCESSED' AND provider IN ('TELTONIKA','QUECLINK') ORDER BY received_at DESC LIMIT 1").bind(workspace.tenantId).first<{provider:string;deviceId:string}>();
    if(!accepted)throw new Response("Takip cihazı kapısı için fiziksel Teltonika veya Queclink paketinin imzalı gateway üzerinden işlenmiş olması gerekir.",{status:409});
    const telemetry=await DB.prepare("SELECT id FROM telemetry_events WHERE tenant_id=? AND device_id=? AND provider=? ORDER BY captured_at DESC LIMIT 1").bind(workspace.tenantId,accepted.deviceId,accepted.provider).first();
    if(!telemetry)throw new Response("İşlenen fiziksel paket için kalıcı telemetri kanıtı bulunamadı.",{status:409});
    const providerName=accepted.provider==="TELTONIKA"?"TELTONIKA_GATEWAY":"QUECLINK_GATEWAY";
    const connection=await DB.prepare("SELECT status FROM provider_connections WHERE tenant_id=? AND provider=?").bind(workspace.tenantId,providerName).first<{status:string}>();
    if(connection?.status!=="CONNECTED")throw new Response(`${providerName} bağlantısı gerçek paketle BAĞLI olmadan bu kapı kapatılamaz.`,{status:409});
    const fieldRun=await DB.prepare("SELECT id FROM field_validation_runs WHERE tenant_id=? AND kind='TRACKER' AND device_id=? AND provider=? AND status='PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId,accepted.deviceId,accepted.provider).first();
    if(!fieldRun)throw new Response("Fiziksel takip cihazı için sunucu telemetrisiyle hesaplanmış başarılı saha testi bulunmalıdır.",{status:409});
  }
  const providerByGate:Record<string,string[]>={
    "RDY-PAYMENT":["PAYMENT"],
    "RDY-EINVOICE":["EINVOICE"],
    "RDY-NOTIFICATION":["RESEND","EXPO_FCM"],
  };
  for(const provider of providerByGate[key]||[]){
    const connection=await DB.prepare("SELECT status FROM provider_connections WHERE tenant_id=? AND provider=?").bind(workspace.tenantId,provider).first<{status:string}>();
    if(connection?.status!=="CONNECTED")throw new Response(`${provider} sağlayıcısı imzalı geri bildirimle BAĞLI olmadan bu kapı kapatılamaz.`,{status:409});
  }
  if(key==="RDY-PAYMENT"){
    const lifecycle=await DB.prepare("SELECT COUNT(DISTINCT json_extract(payload,'$.status')) AS count FROM audit_events WHERE tenant_id=? AND action='PAYMENT_CALLBACK' AND json_extract(payload,'$.status') IN ('COMPLETED','FAILED','CANCELLED','REFUNDED')").bind(workspace.tenantId).first<{count:number}>();
    if(Number(lifecycle?.count||0)<4)throw new Response("Ödeme kapısı için başarılı, başarısız, iptal ve iade callback kanıtlarının tümü gerekir.",{status:409});
  }
  if(key==="RDY-EINVOICE"){
    const lifecycle=await DB.prepare("SELECT COUNT(DISTINCT status) AS count FROM e_documents WHERE tenant_id=? AND status IN ('ACCEPTED','REJECTED','CANCELLED')").bind(workspace.tenantId).first<{count:number}>();
    if(Number(lifecycle?.count||0)<3)throw new Response("E-belge kapısı için kabul, ret ve iptal sağlayıcı sonuçlarının tümü gerekir.",{status:409});
  }
  if(key==="RDY-NOTIFICATION"){
    const lifecycle=await DB.prepare("SELECT SUM(CASE WHEN channel='EMAIL' AND status='DELIVERED' THEN 1 ELSE 0 END) AS emailDelivered,SUM(CASE WHEN channel='EMAIL' AND status='FAILED' THEN 1 ELSE 0 END) AS emailFailed,SUM(CASE WHEN channel='PUSH' AND status='DELIVERED' THEN 1 ELSE 0 END) AS pushDelivered,SUM(CASE WHEN attempts>1 THEN 1 ELSE 0 END) AS retried FROM notification_deliveries WHERE tenant_id=?").bind(workspace.tenantId).first<{emailDelivered:number;emailFailed:number;pushDelivered:number;retried:number}>();
    if(!lifecycle?.emailDelivered||!lifecycle.emailFailed||!lifecycle.pushDelivered||!lifecycle.retried)throw new Response("Bildirim kapısı için e-posta teslim, bounce/hata, push receipt ve aynı kimlikle yeniden deneme kanıtı gerekir.",{status:409});
  }
  if(key==="RDY-TENANT-ISOLATION"){
    const selfCheck=await DB.prepare("SELECT id FROM audit_events WHERE tenant_id=? AND action='SECURITY_SELF_CHECK_PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!selfCheck)throw new Response("Önce tenant ve rol matrisi öz denetimini çalıştırın.",{status:409});
  }
  if(key==="RDY-OBSERVABILITY"){
    const health=await DB.prepare("SELECT id FROM audit_events WHERE tenant_id=? AND action='SYSTEM_HEALTH_CHECK_PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    const drill=await DB.prepare("SELECT id FROM audit_events WHERE tenant_id=? AND action='OBSERVABILITY_DRILL_PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    const critical=await DB.prepare("SELECT COUNT(*) AS count FROM monitoring_events WHERE tenant_id=? AND status<>'RESOLVED' AND severity='CRITICAL'").bind(workspace.tenantId).first<{count:number}>();
    if(!health||!drill||Number(critical?.count||0)>0)throw new Response("Sistem sağlık denetimi, alarm yaşam döngüsü provası ve açık kritik alarm kontrolü tamamlanmalıdır.",{status:409});
  }
  if(key==="RDY-DATA-MIGRATION"){
    const lifecycle=await DB.prepare("SELECT SUM(CASE WHEN status='COMMITTED' THEN 1 ELSE 0 END) AS committed,SUM(CASE WHEN status='ROLLED_BACK' THEN 1 ELSE 0 END) AS rolledBack FROM migration_runs WHERE tenant_id=?").bind(workspace.tenantId).first<{committed:number;rolledBack:number}>();
    if(!lifecycle?.committed||!lifecycle.rolledBack)throw new Response("Doğrulanmış CSV için en az bir kalıcı aktarım ve bir güvenli geri alma provası tamamlanmalıdır.",{status:409});
    const acceptance=await DB.prepare("SELECT id FROM data_acceptance_runs WHERE tenant_id=? AND status='PASSED' AND reconciliation_status='MATCHED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!acceptance)throw new Response("Gerçek veri geçişi için sayım mutabakatı, örneklem kontrolü, geri alma kanıtı ve müşteri onayı gerekir.",{status:409});
  }
  if(key==="RDY-LEGAL-CUSTODY"){
    const legal=await DB.prepare("SELECT status,approved_by AS approvedBy,approved_at AS approvedAt,legal_opinion_reference AS legalOpinionReference,policy_version AS policyVersion FROM legal_profiles WHERE tenant_id=?").bind(workspace.tenantId).first<{status:string;approvedBy:string;approvedAt:string;legalOpinionReference:string;policyVersion:string}>();
    const custody=await DB.prepare("SELECT s.id FROM signature_requests s JOIN module_records r ON r.tenant_id=s.tenant_id AND r.module='custody' AND r.id=s.custody_record_id JOIN file_objects f ON f.tenant_id=s.tenant_id AND f.id=s.evidence_file_id WHERE s.tenant_id=? AND s.status='VERIFIED' AND f.scan_status='CLEAN' AND r.archived=0 AND r.status IN ('ACTIVE','AKTİF','KAPANDI') AND json_extract(r.data,'$.noticeStatus')='TEBLİĞ EDİLDİ' LIMIT 1").bind(workspace.tenantId).first();
    if(legal?.status!=="APPROVED"||!legal.approvedBy||!legal.approvedAt||!legal.legalOpinionReference||!legal.policyVersion||!custody)throw new Response("Onaylı hukuk görüşü/politika sürümü ve temiz kanıt dosyasına bağlı doğrulanmış zimmet imzası zorunludur.",{status:409});
  }
  if(key==="RDY-SECURITY-LOAD"){
    const security=await DB.prepare("SELECT id FROM audit_events WHERE tenant_id=? AND action='SECURITY_SELF_CHECK_PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    const run=await DB.prepare("SELECT id FROM security_test_runs WHERE tenant_id=? AND status='PASSED' AND concurrency>=100 AND p95_ms<=500 AND error_rate_bps<=100 AND critical_count=0 AND high_count=0 AND external_auditor<>'' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    const findings=await DB.prepare("SELECT COUNT(*) AS count FROM security_findings WHERE tenant_id=? AND status<>'VERIFIED_CLOSED' AND severity IN ('CRITICAL','HIGH')").bind(workspace.tenantId).first<{count:number}>();
    const malware=await DB.prepare("SELECT status FROM provider_connections WHERE tenant_id=? AND provider='MALWARE_SCAN'").bind(workspace.tenantId).first<{status:string}>();
    const cleanExternalScan=await DB.prepare("SELECT id FROM file_objects WHERE tenant_id=? AND scan_status='CLEAN' AND scan_engine='CLOUDMERSIVE_VIRUS_SCAN_V1' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!security||!run||Number(findings?.count||0)>0||!/(BAĞIMSIZ|PENETRASYON|OWASP|ASVS)/.test(environment)||malware?.status!=="CONNECTED"||!cleanExternalScan)throw new Response("İç denetim, bağımsız raporlu yük/OWASP koşulları, kapatılmış kritik-yüksek bulgular ve gerçek kötü amaçlı yazılım taraması zorunludur.",{status:409});
  }
  if(key==="RDY-BACKUP-RESTORE"){
    const backup=await DB.prepare("SELECT id FROM audit_events WHERE tenant_id=? AND action='BACKUP_DRY_RUN_PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    const restore=await DB.prepare("SELECT id FROM restore_rehearsals WHERE tenant_id=? AND status='PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!backup||!restore)throw new Response("Yedek bütünlüğü ve üretimden izole gölge alanda geri yükleme provası başarıyla tamamlanmalıdır.",{status:409});
  }
  if(key==="RDY-I18N"){
    const localization=await DB.prepare("SELECT id FROM audit_events WHERE tenant_id=? AND action='I18N_SELF_CHECK_PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first();
    if(!localization)throw new Response("TR/EN katalog, tarih, para, vergi ve saat dilimi biçim denetimini çalıştırın.",{status:409});
  }
  if(key==="RDY-PILOT-UAT"){
    const pilot=await DB.prepare("SELECT id,customer_approver AS customerApprover,platform_approver AS platformApprover FROM pilot_runs WHERE tenant_id=? AND status='PASSED' AND company_count>=2 AND vehicle_count>=3 AND customer_approved_at IS NOT NULL AND platform_approved_at IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first<{id:string;customerApprover:string;platformApprover:string}>();
    if(!pilot||pilot.customerApprover.toLowerCase()===pilot.platformApprover.toLowerCase())throw new Response("En az 2 firma, 3 araç, üç başarılı senaryo ve birbirinden farklı müşteri/platform onayları gerekir.",{status:409});
    const scenarios=await DB.prepare("SELECT COUNT(DISTINCT code) AS count FROM pilot_scenarios WHERE tenant_id=? AND pilot_run_id=? AND status='PASSED' AND code IN ('COMMERCIAL_FLOW','TRACKING_MAINTENANCE','CUSTODY_RETURN')").bind(workspace.tenantId,pilot.id).first<{count:number}>();
    const blockers=await DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE tenant_id=? AND status NOT IN ('RESOLVED','CLOSED') AND priority LIKE 'KRİTİK%'").bind(workspace.tenantId).first<{count:number}>();
    if(Number(scenarios?.count||0)!==3||Number(blockers?.count||0)>0)throw new Response("Üç zorunlu pilot senaryosu geçmeli ve açık kritik destek engeli bulunmamalıdır.",{status:409});
  }
  if(key==="RDY-MOBILE-STORE"){
    const releases=await DB.prepare("SELECT COUNT(DISTINCT platform) AS count FROM mobile_releases mr JOIN file_objects f ON f.tenant_id=mr.tenant_id AND f.id=mr.evidence_file_id WHERE mr.tenant_id=? AND mr.platform IN ('IOS','ANDROID') AND mr.store_status='APPROVED' AND mr.signing_status='VERIFIED' AND mr.background_location_status='ACCEPTED' AND mr.data_safety_status='COMPLETE' AND f.scan_status='CLEAN'").bind(workspace.tenantId).first<{count:number}>();
    const physical=await DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='readiness' AND id IN ('RDY-MOBILE-IOS-KILLED','RDY-MOBILE-ANDROID-OEM') AND status='BAŞARILI' AND archived=0").bind(workspace.tenantId).first<{count:number}>();
    if(Number(releases?.count||0)!==2||Number(physical?.count||0)!==2)throw new Response("iOS ve Android için temiz kanıtlı mağaza onayı, imza, arka plan konumu, veri güvenliği ve fiziksel cihaz kapıları gerekir.",{status:409});
  }
}

async function validateRecord(workspace:Workspace,moduleName:string,data:Record<string,unknown>,editingId?:string){
  const required:Record<string,string[]>={crm:["company","contact","potential","potentialCurrency","team"],requests:["title","customer","service","targetDate","team","description"],offers:["customer","service","quantity","unitPrice","taxJurisdiction","currency","tax","validUntil","team"],entities:["legalName","country","entityType","registrationNo","taxId","currency","billingEmail","phone","address"],fleet:["plate","registrationCountry","make","model","year","chassis","ownerEntity","relation","team"],drivers:["name","phone","license","licenseExpiry","team"],operations:["vehicle","driver","startDate","startTime","route","team"],devices:["assetId","deviceType","manufacturer","modelName","serial","connectionType","status","team"],expenses:["vehicle","category","date","amount","currency","tax","supplier","invoiceType","team"],custody:["assignmentType","asset","recipient","company","handoverDate","signatureMethod","jurisdiction"],readiness:["checkKey","category","checkName","status","executedAt","note"]};
  const missing=(required[moduleName]||[]).filter(key=>!stringValue(data,key));
  if(missing.length)throw new Response(`Zorunlu alanlar eksik: ${missing.join(", ")}`,{status:400});
  for(const key of ["email","billingEmail"]){const value=stringValue(data,key);if(value&&!/^\S+@\S+\.\S+$/.test(value))throw new Response(`${key} geçerli bir e-posta olmalıdır.`,{status:400});}
  for(const key of ["targetDate","validUntil","licenseExpiry","startDate","handoverDate","returnDate","dueDate","expiryDate","date"]){const value=stringValue(data,key);if(value&&!/^\d{2}\.\d{2}\.\d{4}$/.test(value)&&Number.isNaN(Date.parse(value)))throw new Response(`${key} geçerli bir tarih olmalıdır.`,{status:400});}
  const positive=["potential","quantity","unitPrice","year","mileage","amount","cost","damage","heartbeat"];
  for(const key of positive){const value=stringValue(data,key);if(value&&(!Number.isFinite(Number(value.replace(",",".")))||Number(value.replace(",","."))<=0))throw new Response(`${key} sıfırdan büyük bir sayı olmalıdır.`,{status:400});}
  const {DB}=runtimeEnv();
  if(moduleName==="fleet"){
    const plate=stringValue(data,"plate").toLocaleUpperCase("tr-TR"),vin=stringValue(data,"chassis").toLocaleUpperCase("tr-TR");
    if(vin.length!==17||/[IOQ]/.test(vin))throw new Response("VIN/şasi numarası I, O ve Q içermeyen 17 karakter olmalıdır.",{status:400});
    const duplicate=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0 AND id<>? AND (upper(json_extract(data,'$.plate'))=? OR upper(json_extract(data,'$.chassis'))=?) LIMIT 1").bind(workspace.tenantId,editingId||"",plate,vin).first();
    if(duplicate)throw new Response("Aynı plaka veya VIN ile kayıtlı başka bir araç var.",{status:409});
  }
  if(moduleName==="devices"){
    const imei=stringValue(data,"imei"),serial=stringValue(data,"serial").toLocaleUpperCase("tr-TR");
    if(imei&& !/^\d{15}$/.test(imei))throw new Response("IMEI 15 haneli olmalıdır.",{status:400});
    const duplicate=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='devices' AND archived=0 AND id<>? AND ((?<>'' AND json_extract(data,'$.imei')=?) OR upper(json_extract(data,'$.serial'))=?) LIMIT 1").bind(workspace.tenantId,editingId||"",imei,imei,serial).first();
    if(duplicate)throw new Response("Aynı IMEI veya seri numarasıyla kayıtlı cihaz var.",{status:409});
  }
  if(moduleName==="entities"){
    const legalName=stringValue(data,"legalName").toLocaleUpperCase("tr-TR"),taxId=stringValue(data,"taxId").toLocaleUpperCase("tr-TR");
    const duplicate=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='entities' AND archived=0 AND id<>? AND (upper(json_extract(data,'$.legalName'))=? OR (?<>'' AND upper(json_extract(data,'$.taxId'))=?)) LIMIT 1").bind(workspace.tenantId,editingId||"",legalName,taxId,taxId).first();
    if(duplicate)throw new Response("Aynı yasal unvan veya vergi kimliğiyle kayıtlı şirket var.",{status:409});
  }
  if(moduleName==="offers"){
    const profiles=await DB.prepare("SELECT COUNT(*) AS count FROM tax_profile_entries WHERE tenant_id=? AND active=1").bind(workspace.tenantId).first<{count:number}>();
    if(Number(profiles?.count||0)>0)await resolveActiveTaxProfile(workspace,data,true);
  }
  if(moduleName==="drivers"){
    const license=stringValue(data,"license").toLocaleUpperCase("tr-TR");
    const duplicate=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='drivers' AND archived=0 AND id<>? AND upper(json_extract(data,'$.license'))=? LIMIT 1").bind(workspace.tenantId,editingId||"",license).first();
    if(duplicate)throw new Response("Aynı ehliyet numarasıyla kayıtlı sürücü var.",{status:409});
  }
  if(moduleName==="operations"){
    const conflict=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='operations' AND archived=0 AND id<>? AND status IN ('PLANLI','AKTİF') AND json_extract(data,'$.startDate')=? AND (json_extract(data,'$.vehicle')=? OR json_extract(data,'$.driver')=?) LIMIT 1").bind(workspace.tenantId,editingId||"",stringValue(data,"startDate"),stringValue(data,"vehicle"),stringValue(data,"driver")).first();
    if(conflict)throw new Response("Araç veya sürücü aynı tarihte başka bir aktif/plânlı atamada kullanılıyor.",{status:409});
  }
  if(moduleName==="readiness"){
    if(!new Set(["BEKLİYOR","PLANLANDI","BAŞARILI","BAŞARISIZ","HARİCİ BAĞLANTI BEKLİYOR","HUKUK ONAYI BEKLİYOR"]).has(stringValue(data,"status").toLocaleUpperCase("tr-TR")))throw new Response("Geçersiz üretim kanıtı durumu.",{status:400});
    await validateReadinessCompletion(workspace,data,editingId);
  }
}

function prefixFor(module: string) {
  const prefixes: Record<string, string> = { crm: "CRM", requests: "TLP", offers: "TKL", entities: "CMP", fleet: "ARC", tasks: "GRV", operations: "ATM", maintenance: "BKM", expenses: "GDR", documents: "BLG", incidents: "HSR", devices: "DEV", custody: "ZMT", trackers: "TRK", support: "DST", readiness:"RDY" };
  return prefixes[module] || module.slice(0, 3).toLocaleUpperCase("tr-TR");
}

export function newRecordId(module: string) {
  return `${prefixFor(module)}-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

function sourceTransition(targetModule: string) {
  if (targetModule === "requests") return "TALEP AÇILDI";
  if (targetModule === "offers") return "TEKLİF HAZIRLANDI";
  if (targetModule === "operations") return "OPERASYONA AKTARILDI";
  return null;
}

export async function saveRecord(workspace: Workspace, input: { module: string; id?: string; data?: Record<string, unknown>; expectedVersion?:number }) {
  if (!MODULES.has(input.module)) throw new Response("Geçersiz modül.", { status: 400 });
  assertPermission(workspace,"record",input.module);
  if(SYSTEM_ONLY_MODULES.has(input.module))throw new Response("Bu modül yalnız sistem olaylarından beslenir.",{status:403});
  const { DB } = runtimeEnv();
  const data = normalizeRecordData(input.data && typeof input.data === "object" ? input.data : {});
  const id = input.id || newRecordId(input.module);
  const existing = await DB.prepare("SELECT id, version, status FROM module_records WHERE tenant_id = ? AND module = ? AND id = ?").bind(workspace.tenantId, input.module, id).first<{ id: string; version: number; status:string }>();
  if(!existing)await enforcePlanLimit(workspace,input.module);
  if(existing&&input.expectedVersion&&existing.version!==input.expectedVersion)throw new Response("Kayıt başka bir kullanıcı tarafından değiştirildi. Güncel kaydı açıp tekrar deneyin.",{status:409});
  await validateRecord(workspace,input.module,data,input.id);
  const status = input.module === "readiness" ? String(data.status || "BEKLİYOR").toLocaleUpperCase("tr-TR") : existing ? existing.status : initialStatusFor(input.module, data);
  const statements = [];
  if (existing) {
    statements.push(DB.prepare("UPDATE module_records SET data = ?, status = ?, version = version + 1, archived = 0, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND module = ? AND id = ? AND version = ?").bind(JSON.stringify(data), status, workspace.email, workspace.tenantId, input.module, id, existing.version));
  } else {
    statements.push(DB.prepare("INSERT INTO module_records (id, tenant_id, module, status, data, created_by, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(id, workspace.tenantId, input.module, status, JSON.stringify(data), workspace.email, workspace.email));
  }
  const sourceModule = String(data._sourceModule || "");
  const sourceId = String(data._sourceId || "");
  if (sourceModule && sourceId && MODULES.has(sourceModule)) {
    const source=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module=? AND id=? AND archived=0").bind(workspace.tenantId,sourceModule,sourceId).first();
    if(!source)throw new Response("Bağlı kaynak kayıt bulunamadı. Önce gerçek kaynak kaydı oluşturun.",{status:409});
    statements.push(DB.prepare("INSERT OR IGNORE INTO record_links (id, tenant_id, from_module, from_id, to_module, to_id, relation) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(`LNK-${crypto.randomUUID()}`, workspace.tenantId, sourceModule, sourceId, input.module, id, `${sourceModule.toUpperCase()}_TO_${input.module.toUpperCase()}`));
    const nextSourceStatus = sourceTransition(input.module);
    if (nextSourceStatus) statements.push(DB.prepare("UPDATE module_records SET status = ?, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND module = ? AND id = ?").bind(nextSourceStatus, workspace.email, workspace.tenantId, sourceModule, sourceId));
  }
  statements.push(DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, ?, ?, ?, ?)").bind(`AUD-${crypto.randomUUID()}`, workspace.tenantId, workspace.email, existing ? "RECORD_UPDATED" : "RECORD_CREATED", input.module, id, JSON.stringify({ status, sourceModule, sourceId })));
  statements.push(DB.prepare("INSERT INTO outbox_events (id, tenant_id, topic, payload) VALUES (?, ?, ?, ?)").bind(`OUT-${crypto.randomUUID()}`, workspace.tenantId, `${input.module}.${existing ? "updated" : "created"}`, JSON.stringify({ id, module: input.module, status })));
  await DB.batch(statements);
  return { id, module: input.module, status, data, version: (existing?.version || 0) + 1, createdAt: existing ? undefined : new Date().toISOString(), updatedAt: new Date().toISOString() };
}

export async function transitionRecord(workspace: Workspace, input: { module: string; id: string; action: string; status?: string }) {
  if (!MODULES.has(input.module)) throw new Response("Geçersiz modül.", { status: 400 });
  assertPermission(workspace,"record",input.module);
  const { DB } = runtimeEnv();
  const row = await DB.prepare("SELECT data, status FROM module_records WHERE tenant_id = ? AND module = ? AND id = ? AND archived = 0").bind(workspace.tenantId, input.module, input.id).first<{ data: string; status: string }>();
  if (!row) throw new Response("Kayıt bulunamadı.", { status: 404 });
  const data = JSON.parse(row.data || "{}") as Record<string, string>;
  let status = row.status;
  let handled=false;
  const statementsForSignature=[];
  if (input.module === "custody") {
    const noticeDone=data.noticeStatus==="TEBLİĞ EDİLDİ"||data.trackingNotice==="UYGULANMAZ";
    const signatureDone=data.signatureStatus==="DOĞRULANDI";
    if (input.action === "notice") { data.noticeStatus = "TEBLİĞ EDİLDİ"; status = "BİLDİRİM TAMAMLANDI"; handled=true; }
    if (input.action === "send-signature") {
      if(!noticeDone)throw new Response("Önce konum ve kullanım bildirimi tebliğ edilmelidir.",{status:409});
      const method=String(data.signatureMethod||"");
      const provider=method.includes("ISLAK")?"MANUAL":method.includes("OTP")?"RESEND":"QUALIFIED_ESIGN";
      const providerStatus=provider==="MANUAL"?"READY":(await DB.prepare("SELECT status FROM provider_connections WHERE tenant_id=? AND provider=?").bind(workspace.tenantId,provider).first<{status:string}>())?.status;
      data.signatureStatus=provider==="MANUAL"?"ÇIKTI İMZASI BEKLİYOR":providerStatus==="CONNECTED"?"SAĞLAYICIYA GÖNDERİLDİ":"SAĞLAYICI YAPILANDIRMASI GEREKLİ";
      status=data.signatureStatus; handled=true;
      statementsForSignature.push(DB.prepare("INSERT INTO signature_requests (id, tenant_id, custody_record_id, method, provider, status, created_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, custody_record_id) DO UPDATE SET method=excluded.method, provider=excluded.provider, status=excluded.status, updated_at=CURRENT_TIMESTAMP").bind(`SIG-${crypto.randomUUID()}`,workspace.tenantId,input.id,method,provider,providerStatus==="CONNECTED"?"SENT":provider==="MANUAL"?"AWAITING_UPLOAD":"CONFIG_REQUIRED",workspace.email));
    }
    if (input.action === "verify-signature") {
      const request=await DB.prepare("SELECT provider,status FROM signature_requests WHERE tenant_id=? AND custody_record_id=?").bind(workspace.tenantId,input.id).first<{provider:string;status:string}>();
      if(!request)throw new Response("Önce imza işlemi başlatılmalıdır.",{status:409});
      if(request.provider==="MANUAL"){
        const evidence=await DB.prepare("SELECT id,sha256 FROM file_objects WHERE tenant_id=? AND module='custody' AND record_id=? ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId,input.id).first<{id:string;sha256:string}>();
        if(!evidence)throw new Response("Islak imzayı doğrulamak için imzalı tarama dosyası yüklenmelidir.",{status:409});
        data.evidenceId=evidence.id;statementsForSignature.push(DB.prepare("UPDATE signature_requests SET status='VERIFIED',evidence_file_id=?,document_digest=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND custody_record_id=?").bind(evidence.id,evidence.sha256,workspace.tenantId,input.id));
      }else if(request.status!=="VERIFIED")throw new Response("Dijital imza yalnız sağlayıcı geri bildirimiyle doğrulanabilir.",{status:409});
      data.signatureStatus = "DOĞRULANDI"; status = "İMZALANDI"; handled=true;
    }
    if (input.action === "activate") {if(!signatureDone)throw new Response("Doğrulanmış imza olmadan zimmet aktifleştirilemez.",{status:409});status = "AKTİF";handled=true;}
    if (input.action === "return") {if(row.status!=="AKTİF")throw new Response("Yalnız aktif zimmet iade edilebilir.",{status:409});status = "KAPANDI";handled=true;}
    data.workflowStatus = status;
  }
  if (input.action === "approve"&&input.module==="offers") { status = "ONAYLANDI";handled=true; }
  if (input.action === "close"&&["operations","tasks","alerts","incidents"].includes(input.module)) { status = "KAPANDI";handled=true; }
  if(!handled)throw new Response("Bu kayıt için geçersiz durum geçişi.",{status:400});
  await DB.batch([
    DB.prepare("UPDATE module_records SET data = ?, status = ?, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND module = ? AND id = ?").bind(JSON.stringify(data), status, workspace.email, workspace.tenantId, input.module, input.id),
    DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, 'STATUS_TRANSITION', ?, ?, ?)").bind(`AUD-${crypto.randomUUID()}`, workspace.tenantId, workspace.email, input.module, input.id, JSON.stringify({ action: input.action, from: row.status, to: status })),
    DB.prepare("INSERT INTO outbox_events (id, tenant_id, topic, payload) VALUES (?, ?, 'workflow.transitioned', ?)").bind(`OUT-${crypto.randomUUID()}`, workspace.tenantId, JSON.stringify({ id: input.id, module: input.module, action: input.action, status })),
    ...statementsForSignature,
  ]);
  return { id: input.id, module: input.module, status, data };
}

export async function archiveRecord(workspace: Workspace, module: string, id: string) {
  if (!MODULES.has(module)) throw new Response("Geçersiz modül.", { status: 400 });
  assertPermission(workspace,"record",module);
  const { DB } = runtimeEnv();
  const exists=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module=? AND id=? AND archived=0").bind(workspace.tenantId,module,id).first();
  if(!exists)throw new Response("Arşivlenecek kayıt bulunamadı.",{status:404});
  await DB.batch([
    DB.prepare("UPDATE module_records SET archived = 1, version = version + 1, updated_by = ?, updated_at = CURRENT_TIMESTAMP WHERE tenant_id = ? AND module = ? AND id = ?").bind(workspace.email, workspace.tenantId, module, id),
    DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, 'RECORD_ARCHIVED', ?, ?, '{}')").bind(`AUD-${crypto.randomUUID()}`, workspace.tenantId, workspace.email, module, id),
  ]);
}

export async function saveTeam(workspace: Workspace, team: Record<string, unknown>) {
  assertPermission(workspace,"team");
  const { DB } = runtimeEnv();
  const id = String(team.id || `TEAM-${crypto.randomUUID()}`);
  const name = String(team.name || "").trim().toLocaleUpperCase("tr-TR");
  if (!name) throw new Response("Ekip adı zorunludur.", { status: 400 });
  await DB.prepare("INSERT INTO teams (id, tenant_id, name, manager, area, active, updated_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, name) DO UPDATE SET manager = excluded.manager, area = excluded.area, active = excluded.active, updated_at = CURRENT_TIMESTAMP")
    .bind(id, workspace.tenantId, name, String(team.manager || ""), String(team.area || ""), team.active === false ? 0 : 1).run();
  return { id, name, manager: String(team.manager || ""), area: String(team.area || ""), active: team.active !== false };
}

export async function saveMember(workspace: Workspace, member: Record<string, unknown>) {
  assertPermission(workspace,"member");
  const email = String(member.email || "").trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Response("Geçerli e-posta zorunludur.", { status: 400 });
  const role = String(member.role || "Viewer");
  if (!new Set(["Owner", "Admin", "Operator", "Viewer"]).has(role)) throw new Response("Geçersiz rol.", { status: 400 });
  const { DB } = runtimeEnv();
  const current=await DB.prepare("SELECT role,active FROM tenant_members WHERE tenant_id=? AND lower(email)=lower(?)").bind(workspace.tenantId,email).first<{role:string;active:number}>();
  if(role==="Owner"&&current?.role!=="Owner")throw new Response("Yeni Owner atanamaz; sahiplik devri ayrı doğrulanmış süreç gerektirir.",{status:403});
  if(current?.role==="Owner"&&workspace.email!==email)throw new Response("Owner hesabını yalnız hesabın sahibi değiştirebilir.",{status:403});
  if(current?.role==="Owner"&&(role!=="Owner"||member.active===false))throw new Response("Çalışma alanının tek Owner hesabı pasife alınamaz veya rolü düşürülemez.",{status:409});
  const requestedActive=member.active!==false;
  if(requestedActive&&(!current||!current.active)){
    const limits=await tenantEntitlements(workspace);
    if(limits.availableMembers<1)throw Response.json({error:`${limits.plan} paketindeki ${limits.memberLimit} kullanıcı lisansının tamamı kullanılıyor. Bu kullanıcıyı aktifleştirmek için ek kullanıcı satın alın.`,code:"USER_SEAT_REQUIRED",entitlements:limits,purchaseView:"subscription"},{status:409});
  }
  const inviteStatus=email===workspace.email?"ACTIVE":requestedActive?"INVITED":"PENDING_LICENSE";
  const statements=[
    DB.prepare("INSERT INTO tenant_members (tenant_id, email, name, role, team, title, active, invite_status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, email) DO UPDATE SET name = excluded.name, role = excluded.role, team = excluded.team, title = excluded.title, active = excluded.active, invite_status = excluded.invite_status, updated_at = CURRENT_TIMESTAMP")
      .bind(workspace.tenantId, email, String(member.name || email).toLocaleUpperCase("tr-TR"), role, String(member.team || ""), String(member.title || ""), requestedActive ? 1 : 0, inviteStatus),
    DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, 'MEMBER_SAVED', 'users', ?, ?)").bind(`AUD-${crypto.randomUUID()}`, workspace.tenantId, workspace.email, email, JSON.stringify({ role, team: member.team || "", active: requestedActive, inviteStatus })),
  ];
  if(requestedActive&&email!==workspace.email)statements.push(DB.prepare("INSERT INTO outbox_events (id, tenant_id, topic, payload) VALUES (?, ?, 'member.invited', ?)").bind(`OUT-${crypto.randomUUID()}`, workspace.tenantId, JSON.stringify({ email, role })));
  await DB.batch(statements);
  return { email, name: String(member.name || email), role, team: String(member.team || ""), title: String(member.title || ""), active: requestedActive, inviteStatus };
}

export async function purchaseDemoUserSeats(workspace:Workspace,quantity:number){
  assertPermission(workspace,"billing");
  if(workspace.authSource!=="DEMO"||workspace.tenantId!=="TEN-DEMO")throw new Response("Demo lisans işlemi yalnız izole demo çalışma alanında kullanılabilir.",{status:403});
  if(!Number.isInteger(quantity)||quantity<1||quantity>20)throw new Response("1–20 arasında ek kullanıcı seçin.",{status:400});
  const {DB}=runtimeEnv();
  const current=await DB.prepare("SELECT value FROM settings WHERE tenant_id=? AND key='demoPurchasedSeats'").bind(workspace.tenantId).first<{value:string}>();
  const total=Math.max(0,Number(current?.value||0))+quantity;
  await DB.batch([
    DB.prepare("INSERT INTO settings (tenant_id,key,value,updated_by,updated_at) VALUES (?,'demoPurchasedSeats',?,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,key) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(workspace.tenantId,String(total),workspace.email),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'DEMO_USER_SEATS_PURCHASED','subscription','demo-seat',?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,JSON.stringify({quantity,total,simulation:true})),
  ]);
  return {quantity,total,simulation:true,entitlements:await tenantEntitlements(workspace)};
}

export async function saveSettings(workspace: Workspace, values: Record<string, unknown>) {
  assertPermission(workspace,"settings");
  const { DB } = runtimeEnv();
  const allowed = ["language", "distanceUnit", "timezone", "dateFormat", "currency", "trackingPolicy", "retentionDays", "quietHours", "demoMode"];
  const statements = Object.entries(values).filter(([key]) => allowed.includes(key)).map(([key, value]) => DB.prepare("INSERT INTO settings (tenant_id, key, value, updated_by, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(tenant_id, key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP").bind(workspace.tenantId, key, String(value), workspace.email));
  if (statements.length) statements.push(DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, 'SETTINGS_UPDATED', 'settings', 'workspace', ?)").bind(`AUD-${crypto.randomUUID()}`, workspace.tenantId, workspace.email, JSON.stringify(values)));
  if (statements.length) await DB.batch(statements);
  return values;
}

export async function saveLegalProfile(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");
  const profile:LegalProfile={
    controllerName:String(input.controllerName||"").trim(),taxId:String(input.taxId||"").trim(),address:String(input.address||"").trim(),contactEmail:String(input.contactEmail||"").trim().toLowerCase(),dpoContact:String(input.dpoContact||"").trim().toLowerCase(),jurisdictions:String(input.jurisdictions||"").trim(),employeeLegalBasis:String(input.employeeLegalBasis||"").trim(),locationPurposes:String(input.locationPurposes||"").trim(),retentionDays:Number(input.retentionDays||0),periodicDestructionMonths:Number(input.periodicDestructionMonths||0),subprocessors:String(input.subprocessors||"").trim(),status:String(input.status||"LEGAL_REVIEW_REQUIRED").toUpperCase(),approvedBy:String(input.approvedBy||"").trim(),approvedAt:String(input.approvedAt||"").trim(),legalOpinionReference:String(input.legalOpinionReference||"").trim(),policyVersion:String(input.policyVersion||"").trim(),
  };
  if(profile.contactEmail&&!/^\S+@\S+\.\S+$/.test(profile.contactEmail))throw new Response("Geçerli uyum e-postası zorunludur.",{status:400});
  if(profile.dpoContact&&!/^\S+@\S+\.\S+$/.test(profile.dpoContact))throw new Response("Geçerli KVKK/DPO iletişim e-postası zorunludur.",{status:400});
  if(profile.retentionDays<0||profile.periodicDestructionMonths<0||profile.periodicDestructionMonths>6)throw new Response("Saklama süresi pozitif; periyodik imha aralığı 1–6 ay olmalıdır.",{status:400});
  if(!["DRAFT","LEGAL_REVIEW_REQUIRED","APPROVED"].includes(profile.status))throw new Response("Geçersiz hukuk profili durumu.",{status:400});
  if(profile.status==="APPROVED"){const readiness=legalProfileReadiness(profile);if(readiness.missing.length)throw new Response(`Hukuk onayı için eksik alanlar: ${readiness.missing.join(", ")}`,{status:409})}
  const {DB}=runtimeEnv();
  await DB.batch([
    DB.prepare("INSERT INTO legal_profiles (tenant_id,controller_name,tax_id,address,contact_email,dpo_contact,jurisdictions,employee_legal_basis,location_purposes,retention_days,periodic_destruction_months,subprocessors,status,approved_by,approved_at,legal_opinion_reference,policy_version,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id) DO UPDATE SET controller_name=excluded.controller_name,tax_id=excluded.tax_id,address=excluded.address,contact_email=excluded.contact_email,dpo_contact=excluded.dpo_contact,jurisdictions=excluded.jurisdictions,employee_legal_basis=excluded.employee_legal_basis,location_purposes=excluded.location_purposes,retention_days=excluded.retention_days,periodic_destruction_months=excluded.periodic_destruction_months,subprocessors=excluded.subprocessors,status=excluded.status,approved_by=excluded.approved_by,approved_at=excluded.approved_at,legal_opinion_reference=excluded.legal_opinion_reference,policy_version=excluded.policy_version,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(workspace.tenantId,profile.controllerName,profile.taxId,profile.address,profile.contactEmail,profile.dpoContact,profile.jurisdictions,profile.employeeLegalBasis,profile.locationPurposes,profile.retentionDays,profile.periodicDestructionMonths,profile.subprocessors,profile.status,profile.approvedBy,profile.approvedAt,profile.legalOpinionReference,profile.policyVersion,workspace.email),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'LEGAL_PROFILE_UPDATED','legal','workspace',?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,JSON.stringify({status:profile.status,jurisdictions:profile.jurisdictions,approvedBy:profile.approvedBy,approvedAt:profile.approvedAt})),
  ]);
  return {...profile,readiness:legalProfileReadiness(profile)};
}

export async function getLegalProfile(workspace:Workspace):Promise<LegalProfile>{
  const {DB}=runtimeEnv();const row=await DB.prepare("SELECT controller_name AS controllerName,tax_id AS taxId,address,contact_email AS contactEmail,dpo_contact AS dpoContact,jurisdictions,employee_legal_basis AS employeeLegalBasis,location_purposes AS locationPurposes,retention_days AS retentionDays,periodic_destruction_months AS periodicDestructionMonths,subprocessors,status,approved_by AS approvedBy,approved_at AS approvedAt,legal_opinion_reference AS legalOpinionReference,policy_version AS policyVersion,updated_at AS updatedAt FROM legal_profiles WHERE tenant_id=?").bind(workspace.tenantId).first<LegalProfile>();
  return row||{controllerName:workspace.tenantName,taxId:"",address:"",contactEmail:workspace.email,dpoContact:"",jurisdictions:"",employeeLegalBasis:"",locationPurposes:"",retentionDays:0,periodicDestructionMonths:0,subprocessors:"",status:"LEGAL_REVIEW_REQUIRED",approvedBy:"",approvedAt:"",legalOpinionReference:"",policyVersion:""};
}

export async function rescanTenantFiles(workspace:Workspace){
  assertPermission(workspace,"settings");const env=runtimeEnv(),{DB,BUCKET}=env;const rows=await DB.prepare("SELECT id,object_key AS objectKey,file_name AS fileName,content_type AS contentType FROM file_objects WHERE tenant_id=? AND scan_status<>'CLEAN' ORDER BY created_at LIMIT 200").bind(workspace.tenantId).all<{id:string;objectKey:string;fileName:string;contentType:string}>();
  let clean=0,quarantined=0,missing=0,pending=0;
  for(const row of rows.results){const object=await BUCKET.get(row.objectKey);if(!object){missing++;await DB.prepare("UPDATE file_objects SET scan_status='QUARANTINED',scan_engine='FILO_STATIC_SCAN_V1',scan_summary='Nesne içeriği bulunamadı.' WHERE tenant_id=? AND id=?").bind(workspace.tenantId,row.id).run();continue}const bytes=new Uint8Array(await object.arrayBuffer());const scan=await scanUploadedFileWithProvider({provider:env.MALWARE_SCAN_PROVIDER,cloudmersiveApiKey:env.CLOUDMERSIVE_API_KEY},row.contentType,bytes,row.fileName);if(scan.status==="CLEAN")clean++;else if(scan.status==="QUARANTINED")quarantined++;else pending++;await DB.prepare("UPDATE file_objects SET scan_status=?,scan_engine=?,scan_summary=? WHERE tenant_id=? AND id=?").bind(scan.status,scan.engine,scan.summary,workspace.tenantId,row.id).run();if(scan.providerVerified)await DB.prepare("UPDATE provider_connections SET status='CONNECTED',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider='MALWARE_SCAN'").bind(workspace.tenantId).run()}
  await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'FILE_RESCAN_COMPLETED','security','tenant-files',?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,JSON.stringify({scanned:rows.results.length,clean,quarantined,missing})).run();
  return {scanned:rows.results.length,clean,quarantined,missing,pending};
}

export async function createSupportTicket(workspace: Workspace, ticket: Record<string, unknown>) {
  const id = newRecordId("support");
  const description = String(ticket.description || "").trim();
  if (!description) throw new Response("Talep açıklaması zorunludur.", { status: 400 });
  const { DB } = runtimeEnv();
  await DB.batch([
    DB.prepare("INSERT INTO support_tickets (id, tenant_id, requester_email, module, page_area, type, priority, description, reference) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").bind(id, workspace.tenantId, workspace.email, String(ticket.module || "GENEL"), String(ticket.page || "ANA EKRAN"), String(ticket.type || "SORUN / HATA"), String(ticket.priority || "NORMAL"), description, String(ticket.reference || "")),
    DB.prepare("INSERT INTO outbox_events (id, tenant_id, topic, payload) VALUES (?, ?, 'support.created', ?)").bind(`OUT-${crypto.randomUUID()}`, workspace.tenantId, JSON.stringify({ id, priority: ticket.priority || "NORMAL", email:workspace.email })),
    DB.prepare("INSERT INTO audit_events (id, tenant_id, actor_email, action, module, record_id, payload) VALUES (?, ?, ?, 'SUPPORT_CREATED', 'support', ?, ?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({priority:ticket.priority||"NORMAL"})),
  ]);
  return { id, status: "OPEN" };
}

export async function recordConsent(workspace:Workspace,input:Record<string,unknown>){
  const documentKey=String(input.documentKey||"TERMS_OF_SERVICE"),documentVersion=String(input.documentVersion||"2026-08-v4"),locale=String(input.locale||"tr-TR");
  if(!["TERMS_OF_SERVICE","PRIVACY_NOTICE_ACKNOWLEDGED"].includes(documentKey))throw new Response("Tanımsız üyelik belgesi.",{status:400});
  const env=runtimeEnv(),status=platformLegalStatus(env);if(!status.ready||documentVersion!==status.version)throw new Response("Platform yasal işletmeci bilgileri ve güncel belge sürümü tamamlanmadan yeni üyelik kabulü alınamaz.",{status:503});
  const {DB}=env;const id=`CNS-${crypto.randomUUID()}`;
  await DB.batch([
    DB.prepare("INSERT OR IGNORE INTO consent_events (id,tenant_id,actor_email,document_key,document_version,locale,evidence) VALUES (?,?,?,?,?,?,?)").bind(id,workspace.tenantId,workspace.email,documentKey,documentVersion,locale,JSON.stringify({source:"SIWC",acknowledged:true,separatePurposes:true})),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'CONSENT_ACCEPTED','security',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,documentKey,JSON.stringify({documentVersion,locale})),
  ]);return {id,documentKey,documentVersion};
}

export async function createSubscriptionOrder(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"billing");
  const plan=String(input.plan||"").toUpperCase(),period=String(input.period||"MONTHLY").toUpperCase(),currency=String(input.currency||"TRY").toUpperCase();
  const planCodes=["STARTER","PROFESSIONAL","ENTERPRISE"] as const;
  type PlanCode=typeof planCodes[number];
  const seats=Number(input.seats),vehicles=Number(input.vehicles),amountMinor=Number(input.amountMinor);
  if(!planCodes.includes(plan as PlanCode)||!["MONTHLY","ANNUAL"].includes(period)||!["TRY","USD"].includes(currency)||!Number.isInteger(seats)||seats<1||!Number.isInteger(vehicles)||vehicles<1||!Number.isInteger(amountMinor)||amountMinor<0)throw new Response("Geçersiz abonelik özeti.",{status:400});
  const paidPlan=plan as PlanCode;
  const included={STARTER:10,PROFESSIONAL:30,ENTERPRISE:60}[paidPlan];if((paidPlan!=="ENTERPRISE"&&vehicles!==included)||(paidPlan==="ENTERPRISE"&&vehicles<included))throw new Response("Araç adedi seçilen paketle uyumlu değil.",{status:400});
  const base=(currency==="TRY"?{STARTER:1000,PROFESSIONAL:2000,ENTERPRISE:3000}:{STARTER:20,PROFESSIONAL:39,ENTERPRISE:59})[paidPlan];const perExtra=(currency==="TRY"?{STARTER:600,PROFESSIONAL:1000,ENTERPRISE:1500}:{STARTER:12,PROFESSIONAL:20,ENTERPRISE:30})[paidPlan];
  const discount=seats>=50?35:seats>=20?30:seats>=10?25:seats>=5?18:seats>=3?12:seats>=2?7:0;const userExtra=Math.round((seats-1)*perExtra*(1-discount/100));const extraVehicles=plan==="ENTERPRISE"?Math.max(0,vehicles-included):0;const band=vehicles>=1000?.45:vehicles>=500?.55:vehicles>=200?.68:vehicles>=150?.75:vehicles>=100?.82:vehicles>=75?.9:1;const vehicleExtra=Math.round(extraVehicles*(currency==="TRY"?25:.5)*band);const monthly=base+userExtra+vehicleExtra;const subtotal=period==="ANNUAL"?Math.round(monthly*10):monthly;const expectedMinor=Math.round((subtotal+(currency==="TRY"?Math.round(subtotal*.2):0))*100);
  if(amountMinor!==expectedMinor)throw new Response("Abonelik tutarı sunucu fiyatlandırmasıyla eşleşmiyor.",{status:409});
  const {DB}=runtimeEnv();const provider=await DB.prepare("SELECT status FROM provider_connections WHERE tenant_id=? AND provider='PAYMENT'").bind(workspace.tenantId).first<{status:string}>();
  const status=provider?.status==="CONNECTED"?"PENDING_PROVIDER":"PAYMENT_PROVIDER_REQUIRED",id=`SUB-${crypto.randomUUID()}`;
  await DB.batch([
    DB.prepare("INSERT INTO subscription_orders (id,tenant_id,plan,period,seats,vehicles,amount_minor,currency,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,plan,period,seats,vehicles,amountMinor,currency,status,workspace.email),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'SUBSCRIPTION_ORDER_CREATED','subscription',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({plan,period,seats,vehicles,amountMinor,currency,status})),
  ]);return {id,status,plan,period,seats,vehicles,amountMinor,currency};
}

export async function processOutbox(workspace:Workspace){
  assertPermission(workspace,"provider");const env=runtimeEnv(),{DB}=env;
  const pending=await DB.prepare("SELECT id,topic,payload FROM outbox_events WHERE tenant_id=? AND status IN ('PENDING','CONFIG_REQUIRED') ORDER BY created_at LIMIT 50").bind(workspace.tenantId).all<{id:string;topic:string;payload:string}>();
  const emailReady=Boolean(env.RESEND_API_KEY&&env.RESEND_WEBHOOK_SECRET&&env.RESEND_FROM),pushReady=Boolean(env.EXPO_ACCESS_TOKEN&&env.EXPO_PROJECT_ID);
  let processed=0,readyForProvider=0,blocked=0;const statements=[];
  for(const event of pending.results){const needsEmail=/member\.invited|support\.|email/i.test(event.topic),needsPush=/push/i.test(event.topic),needsAnyNotification=/notifications?\./.test(event.topic),external=needsEmail||needsPush||needsAnyNotification;const providerReady=needsEmail?emailReady:needsPush?pushReady:needsAnyNotification?(emailReady||pushReady):true;const next=!external?"PROCESSED":providerReady?"DISPATCH_READY":"CONFIG_REQUIRED";if(next==="PROCESSED")processed++;else if(next==="DISPATCH_READY")readyForProvider++;else blocked++;statements.push(DB.prepare("UPDATE outbox_events SET status=?,last_error=?,processed_at=CASE WHEN ?='PROCESSED' THEN CURRENT_TIMESTAMP ELSE processed_at END WHERE tenant_id=? AND id=?").bind(next,next==="CONFIG_REQUIRED"?"Required external provider configuration is missing":next==="DISPATCH_READY"?"Awaiting provider dispatch and signed delivery callback":"",next,workspace.tenantId,event.id));}
  if(statements.length)await DB.batch(statements);return {processed,readyForProvider,blocked,total:pending.results.length};
}

export async function verifyProviderConfiguration(workspace:Workspace){
  assertPermission(workspace,"provider");
  const env=runtimeEnv();
  const {DB}=env;
  const gatewayTokens=await DB.prepare("SELECT provider,COUNT(*) AS count FROM device_ingest_tokens WHERE tenant_id=? AND active=1 AND expires_at>CURRENT_TIMESTAMP GROUP BY provider").bind(workspace.tenantId).all<{provider:string;count:number}>();
  const tokenCounts=Object.fromEntries(gatewayTokens.results.map(row=>[row.provider+"_GATEWAY",Number(row.count)]));
  const report=providerConfiguration(env,tokenCounts);
  const configured=Object.fromEntries(Object.entries(report).map(([provider,value])=>[provider,value.configured])) as Record<string,boolean>;
  const current=await DB.prepare("SELECT provider,status FROM provider_connections WHERE tenant_id=?").bind(workspace.tenantId).all<{provider:string;status:string}>();
  const statements=current.results.map(item=>{const next=item.status==="CONNECTED"?"CONNECTED":configured[item.provider]?"CONFIG_PRESENT":"CONFIG_REQUIRED";return DB.prepare("UPDATE provider_connections SET status=?,last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider=?").bind(next,workspace.tenantId,item.provider)});
  statements.push(DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'PROVIDER_CONFIG_CHECKED','settings','providers',?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,JSON.stringify(configured)));
  await DB.batch(statements);
  return {configured,report,checked:current.results.length};
}

export async function technicalReadiness2to6(workspace:Workspace){
  assertPermission(workspace,"read");
  const env=runtimeEnv(),{DB}=env,now=Date.now(),maximumSecretAgeDays=Math.max(1,Number(env.SECRET_MAX_AGE_DAYS||90));
  const [providerRows,gatewayTokens,mobileRuns,trackerRuns]=await Promise.all([
    DB.prepare("SELECT provider,status,last_check_at AS lastCheckAt FROM provider_connections WHERE tenant_id=? ORDER BY provider").bind(workspace.tenantId).all<{provider:string;status:string;lastCheckAt?:string}>(),
    DB.prepare("SELECT provider,COUNT(*) AS count FROM device_ingest_tokens WHERE tenant_id=? AND active=1 AND expires_at>CURRENT_TIMESTAMP GROUP BY provider").bind(workspace.tenantId).all<{provider:string;count:number}>(),
    DB.prepare("SELECT platform,manufacturer,scenario,status,created_at AS createdAt FROM field_validation_runs WHERE tenant_id=? AND kind='MOBILE' ORDER BY created_at DESC").bind(workspace.tenantId).all<{platform:string;manufacturer:string;scenario:string;status:string;createdAt:string}>(),
    DB.prepare("SELECT provider,device_id AS deviceId,status,gateway_event_count AS gatewayEventCount,telemetry_count AS telemetryCount,created_at AS createdAt FROM field_validation_runs WHERE tenant_id=? AND kind='TRACKER' ORDER BY created_at DESC").bind(workspace.tenantId).all<{provider:string;deviceId:string;status:string;gatewayEventCount:number;telemetryCount:number;createdAt:string}>(),
  ]);
  const tokenCounts=Object.fromEntries(gatewayTokens.results.map(row=>[`${row.provider}_GATEWAY`,Number(row.count)])),providerConfig=providerConfiguration(env,tokenCounts),providerStatuses=Object.fromEntries(providerRows.results.map(row=>[row.provider,row.status]));
  const environmentMissing:string[]=[];
  const supabaseRuntime=String(env.FILO_RUNTIME||"").toLowerCase()==="supabase";
  if(String(env.APP_ENV||"").toUpperCase()!=="PRODUCTION")environmentMissing.push("APP_ENV=PRODUCTION");
  if(!String(env.ENVIRONMENT_ID||"").trim())environmentMissing.push("ENVIRONMENT_ID");
  if(supabaseRuntime){
    if(!String(env.NEXT_PUBLIC_SUPABASE_URL||"").startsWith("https://"))environmentMissing.push("NEXT_PUBLIC_SUPABASE_URL HTTPS");
    if(!String(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY||"").trim())environmentMissing.push("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    if(!String(env.SUPABASE_SERVICE_ROLE_KEY||"").trim())environmentMissing.push("SUPABASE_SERVICE_ROLE_KEY");
    if(!/^postgres(ql)?:\/\//u.test(String(env.SUPABASE_DATABASE_URL||"")))environmentMissing.push("SUPABASE_DATABASE_URL");
    if(!String(env.SUPABASE_STORAGE_BUCKET||"").trim())environmentMissing.push("SUPABASE_STORAGE_BUCKET");
    if(String(env.SUPABASE_CRON_MODE||"").toUpperCase()!=="PG_CRON")environmentMissing.push("SUPABASE_CRON_MODE=PG_CRON");
  }else{
    if(!String(env.D1_ENVIRONMENT_ID||"").trim())environmentMissing.push("D1_ENVIRONMENT_ID");
    if(!String(env.R2_ENVIRONMENT_ID||"").trim())environmentMissing.push("R2_ENVIRONMENT_ID");
    if(env.D1_ENVIRONMENT_ID&&env.D1_ENVIRONMENT_ID===env.R2_ENVIRONMENT_ID)environmentMissing.push("D1/R2 AYRI KAYNAK");
  }
  try{if(new URL(String(env.PUBLIC_APP_ORIGIN||"")).protocol!=="https:")environmentMissing.push("PUBLIC_APP_ORIGIN HTTPS")}catch{environmentMissing.push("PUBLIC_APP_ORIGIN")}
  const rotatedAt=Date.parse(String(env.SECRETS_ROTATED_AT||"")),secretAgeDays=Number.isFinite(rotatedAt)?Math.floor((now-rotatedAt)/86400000):null;
  if(secretAgeDays===null||secretAgeDays<0||secretAgeDays>maximumSecretAgeDays)environmentMissing.push("SECRETS_ROTATED_AT");
  if(!String(env.SECRET_ROTATION_OWNER||"").trim())environmentMissing.push("SECRET_ROTATION_OWNER");
  const requiredProviders=Object.keys(PROVIDER_REQUIREMENTS),configurationMissing=requiredProviders.filter(provider=>!providerConfig[provider]?.configured),callbackMissing=requiredProviders.filter(provider=>providerStatuses[provider]!=="CONNECTED");
  const map=geocodingConfiguration(env),mobilePassed=mobileRuns.results.filter(row=>row.status==="PASSED"),mobileCoverage=new Set(mobilePassed.map(row=>row.platform==="IOS"?"IOS":row.manufacturer)),requiredMobile=["IOS","SAMSUNG","XIAOMI","OPPO","PIXEL"],mobileMissing=requiredMobile.filter(item=>!mobileCoverage.has(item));
  const activeTrackerProviders=gatewayTokens.results.filter(row=>["TELTONIKA","QUECLINK"].includes(row.provider)&&Number(row.count)>0).map(row=>row.provider),passedTrackerProviders=new Set(trackerRuns.results.filter(row=>row.status==="PASSED"&&row.gatewayEventCount>0&&row.telemetryCount>0).map(row=>row.provider)),trackerMissing=activeTrackerProviders.length?activeTrackerProviders.filter(provider=>!passedTrackerProviders.has(provider)):["AKTİF FİZİKSEL CİHAZ TOKENI"];
  const gate=(order:number,id:string,title:string,missing:string[],metrics:Record<string,unknown>,readyLabel="PASSED")=>({order,id,title,status:missing.length?"EXTERNAL_ACTION_REQUIRED":readyLabel,softwareReady:true,externalProofRequired:missing.length>0,missing,metrics});
  const gates=[
    gate(2,"PRODUCTION_ENVIRONMENT","Üretim ortamı ve secret doğrulaması",environmentMissing,{environment:String(env.ENVIRONMENT_ID||""),runtime:supabaseRuntime?"SUPABASE":"CLOUDFLARE",databaseIsolated:supabaseRuntime?Boolean(env.SUPABASE_DATABASE_URL):Boolean(env.D1_ENVIRONMENT_ID),storageIsolated:supabaseRuntime?Boolean(env.SUPABASE_STORAGE_BUCKET):Boolean(env.R2_ENVIRONMENT_ID),secretAgeDays,maximumSecretAgeDays},"CONFIGURED"),
    gate(3,"LIVE_PROVIDERS","Gerçek sağlayıcı hesapları",[...configurationMissing.map(item=>`${item}:CONFIG`),...callbackMissing.map(item=>`${item}:CALLBACK`)],{configured:requiredProviders.length-configurationMissing.length,connected:requiredProviders.length-callbackMissing.length,total:requiredProviders.length}),
    gate(4,"MAP_GEOCODING","Harita ve geocoding",map.missing,{provider:map.provider,endpointHost:(()=>{try{return new URL(map.endpoint).hostname}catch{return ""}})()},"CONFIGURED"),
    gate(5,"MOBILE_FIELD_MATRIX","Telefon saha matrisi",mobileMissing,{passedRuns:mobilePassed.length,coverage:[...mobileCoverage],required:requiredMobile}),
    gate(6,"TRACKER_FIELD_TEST","Fiziksel takip cihazları",trackerMissing,{activeProviders:activeTrackerProviders,passedProviders:[...passedTrackerProviders],passedRuns:trackerRuns.results.filter(row=>row.status==="PASSED").length}),
  ];
  return {format:"FILO_TECHNICAL_READINESS_2_6_V1",checkedAt:new Date().toISOString(),status:gates.every(item=>item.status==="PASSED"||item.status==="CONFIGURED")?"SOFTWARE_READY_EXTERNAL_PROOF_PENDING":"EXTERNAL_ACTION_REQUIRED",secretValuesIncluded:false,gates};
}

function permissionProbe(workspace:Workspace,action:"record"|"member"|"settings"|"billing"|"provider",moduleName?:string){
  try{assertPermission(workspace,action,moduleName);return true}catch{return false}
}

export async function runSecuritySelfCheck(workspace:Workspace){
  assertPermission(workspace,"settings");
  const synthetic=(role:string):Workspace=>({...workspace,role});
  const checks:Array<{key:string;passed:boolean;detail?:string}>=[
    {key:"OWNER_READINESS_WRITE",passed:permissionProbe(synthetic("Owner"),"record","readiness")},
    {key:"ADMIN_MEMBER_WRITE",passed:permissionProbe(synthetic("Admin"),"member")},
    {key:"ADMIN_BILLING_DENIED",passed:!permissionProbe(synthetic("Admin"),"billing")},
    {key:"OPERATOR_TASK_WRITE",passed:permissionProbe(synthetic("Operator"),"record","tasks")},
    {key:"OPERATOR_READINESS_DENIED",passed:!permissionProbe(synthetic("Operator"),"record","readiness")},
    {key:"VIEWER_WRITE_DENIED",passed:!permissionProbe(synthetic("Viewer"),"record","fleet")},
  ];
  const {DB}=runtimeEnv();
  const [foreignProbe,auditTriggers,rateTable,fileScan]=await Promise.all([
    DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id='__FILO_FOREIGN_TENANT_PROBE__'").first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name IN ('audit_events_block_update','audit_events_block_delete')").first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='rate_limit_windows'").first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN scan_status='CLEAN' THEN 1 ELSE 0 END) AS clean,SUM(CASE WHEN scan_status='QUARANTINED' THEN 1 ELSE 0 END) AS quarantined FROM file_objects WHERE tenant_id=?").bind(workspace.tenantId).first<{total:number;clean:number;quarantined:number}>(),
  ]);
  checks.push({key:"TENANT_QUERY_SCOPE",passed:Number(foreignProbe?.count||0)===0});
  checks.push({key:"AUDIT_APPEND_ONLY",passed:Number(auditTriggers?.count||0)===2});
  checks.push({key:"D1_RATE_LIMIT",passed:Number(rateTable?.count||0)===1});
  checks.push({key:"FILE_SCAN_COVERAGE",passed:Number(fileScan?.total||0)===Number(fileScan?.clean||0)+Number(fileScan?.quarantined||0),detail:`${Number(fileScan?.clean||0)} temiz · ${Number(fileScan?.quarantined||0)} karantina · ${Number(fileScan?.total||0)} toplam`});
  const passed=checks.every(item=>item.passed);
  await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"SECURITY_SELF_CHECK_PASSED":"SECURITY_SELF_CHECK_FAILED","security","role-matrix",JSON.stringify({checks,scope:"APPLICATION_SELF_CHECK_NOT_PENETRATION_TEST"})).run();
  return {passed,checks,scope:"APPLICATION_SELF_CHECK_NOT_PENETRATION_TEST",executedAt:new Date().toISOString()};
}

export async function runSystemHealthCheck(workspace:Workspace){
  assertPermission(workspace,"provider");
  const {DB,BUCKET}=runtimeEnv();
  const [database,failedOutbox,staleTelemetry,providers,storage]=await Promise.all([
    DB.prepare("SELECT 1 AS ok").first<{ok:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id=? AND status='FAILED'").bind(workspace.tenantId).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM (SELECT vehicle_id FROM telemetry_events WHERE tenant_id=? GROUP BY vehicle_id HAVING (julianday('now')-julianday(MAX(captured_at)))*86400>300)").bind(workspace.tenantId).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='CONNECTED' THEN 1 ELSE 0 END) AS connected FROM provider_connections WHERE tenant_id=?").bind(workspace.tenantId).first<{total:number;connected:number}>(),
    BUCKET.list({prefix:`${workspace.tenantId}/`,limit:1}),
  ]);
  const checks=[
    {key:"DATABASE",passed:database?.ok===1,detail:"D1 sorgusu"},
    {key:"OBJECT_STORAGE",passed:Boolean(storage),detail:"R2 listeleme"},
    {key:"OUTBOX",passed:Number(failedOutbox?.count||0)===0,detail:`${Number(failedOutbox?.count||0)} başarısız teslimat`},
    {key:"TELEMETRY_FRESHNESS",passed:Number(staleTelemetry?.count||0)===0,detail:`${Number(staleTelemetry?.count||0)} eski araç`},
    {key:"PROVIDER_VISIBILITY",passed:Number(providers?.total||0)>0,detail:`${Number(providers?.connected||0)}/${Number(providers?.total||0)} bağlı`},
  ];
  const passed=checks.slice(0,3).every(item=>item.passed);
  const alarmMap:Record<string,{severity:string;team:string}>={DATABASE:{severity:"CRITICAL",team:"TEKNİK EKİP"},OBJECT_STORAGE:{severity:"CRITICAL",team:"TEKNİK EKİP"},OUTBOX:{severity:"HIGH",team:"OPERASYON"},TELEMETRY_FRESHNESS:{severity:"HIGH",team:"TEKNİK EKİP"},PROVIDER_VISIBILITY:{severity:"MEDIUM",team:"YÖNETİM"}};
  const alarmStatements=[];
  for(const check of checks){const mapping=alarmMap[check.key];if(check.passed)alarmStatements.push(DB.prepare("UPDATE monitoring_events SET status='RESOLVED',resolved_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND signal=? AND status<>'RESOLVED'").bind(workspace.tenantId,check.key));else alarmStatements.push(DB.prepare("INSERT INTO monitoring_events (id,tenant_id,source,signal,severity,status,detail,assigned_team) SELECT ?,?,'SYSTEM_HEALTH',?,?,'OPEN',?,? WHERE NOT EXISTS (SELECT 1 FROM monitoring_events WHERE tenant_id=? AND signal=? AND status<>'RESOLVED')").bind(`MON-${crypto.randomUUID()}`,workspace.tenantId,check.key,mapping.severity,check.detail,mapping.team,workspace.tenantId,check.key))}
  alarmStatements.push(DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"SYSTEM_HEALTH_CHECK_PASSED":"SYSTEM_HEALTH_CHECK_FAILED","security","system-health",JSON.stringify({checks,scope:"INTERNAL_HEALTH_CHECK"})));
  await DB.batch(alarmStatements);
  return {passed,checks,executedAt:new Date().toISOString(),scope:"INTERNAL_HEALTH_CHECK"};
}

export async function runObservabilityDrill(workspace:Workspace){
  assertPermission(workspace,"provider");const env=runtimeEnv(),{DB}=env,id=`MON-${crypto.randomUUID()}`,recipients=String(env.OPERATIONS_ALERT_EMAILS||"").split(",").map(value=>value.trim().toLowerCase()).filter(value=>/^\S+@\S+\.\S+$/.test(value));
  if(!recipients.length)throw new Response("Alarm provası için OPERATIONS_ALERT_EMAILS içinde gerçek nöbetçi alıcısı zorunludur.",{status:503});
  await DB.batch([
    DB.prepare("INSERT INTO monitoring_events (id,tenant_id,source,signal,severity,status,detail,assigned_team,fingerprint,occurrence_count,first_detected_at,last_detected_at,acknowledge_due_at,escalation_due_at) VALUES (?,?,'DRILL','TEST_ALERT','HIGH','OPEN','Harici teslimat, onay ve kapanış kanıtı bekleniyor','TEKNİK EKİP',?,1,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,datetime('now','+15 minutes'),datetime('now','+30 minutes'))").bind(id,workspace.tenantId,`${workspace.tenantId}:DRILL:${id}`),
    ...recipients.slice(0,10).map(email=>DB.prepare("INSERT INTO outbox_events (id,tenant_id,topic,payload) VALUES (?,?,'notifications.operations_alert',?)").bind(`OUT-${crypto.randomUUID()}`,workspace.tenantId,JSON.stringify({id,email,signal:"TEST_ALERT",severity:"HIGH",detail:"Alarm teslimat provası",team:"TEKNİK EKİP",runbook:"/docs/operations/alert-routing"}))),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'OBSERVABILITY_DRILL_QUEUED','security',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({signal:"TEST_ALERT",recipientCount:recipients.length,status:"EXTERNAL_DELIVERY_REQUIRED"})),
  ]);return {passed:false,status:"EXTERNAL_DELIVERY_REQUIRED",checks:[{key:"ALARM_ROUTING",passed:false,detail:`${recipients.length} gerçek alıcıya teslimat kuyruğa alındı`},{key:"ACKNOWLEDGEMENT",passed:false,detail:"Nöbetçi onayı bekleniyor"},{key:"RESOLUTION",passed:false,detail:"Kanıtlı kapanış bekleniyor"}],eventId:id,assignedTeam:"TEKNİK EKİP",lifecycle:["OPEN"],executedAt:new Date().toISOString()};
}

const IMPORT_MODULES=new Set(["entities","fleet","drivers","devices","crm","expenses"]);

export async function bulkImportRecords(workspace:Workspace,input:{module:string;rows:Record<string,unknown>[];commit:boolean;sourceSha256?:string}){
  const moduleName=String(input.module||"");if(!IMPORT_MODULES.has(moduleName))throw new Response("Bu modül toplu aktarmayı desteklemiyor.",{status:400});
  assertPermission(workspace,"record",moduleName);if(!Array.isArray(input.rows)||!input.rows.length||input.rows.length>200)throw new Response("CSV dosyası 1–200 veri satırı içermelidir.",{status:400});
  const normalized=input.rows.map(row=>normalizeRecordData(row));const errors:Array<{row:number;error:string}>=[];const seen=new Set<string>();
  for(let index=0;index<normalized.length;index++){
    const row=normalized[index];const unique=moduleName==="fleet"?`${stringValue(row,"plate")}|${stringValue(row,"chassis")}`:moduleName==="devices"?`${stringValue(row,"imei")}|${stringValue(row,"serial")}`:moduleName==="entities"?`${stringValue(row,"taxId")}|${stringValue(row,"legalName")}`:moduleName==="drivers"?stringValue(row,"license"):"";
    if("_sourceModule" in row||"_sourceId" in row){errors.push({row:index+2,error:"Toplu aktarımda kaynak bağlantısı kullanılamaz; ilişkiler aktarım sonrasında kontrollü kurulmalıdır."});continue}
    if(unique&&seen.has(unique)){errors.push({row:index+2,error:"Dosya içinde mükerrer benzersiz kayıt."});continue}if(unique)seen.add(unique);
    try{await validateRecord(workspace,moduleName,row)}catch(error){errors.push({row:index+2,error:error instanceof Response?await error.text():error instanceof Error?error.message:"Geçersiz satır."})}
  }
  if(errors.length||!input.commit){
    if(!errors.length){const {DB}=runtimeEnv();await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'BULK_IMPORT_VALIDATED',?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,moduleName,`IMPORT-PREVIEW-${crypto.randomUUID()}`,JSON.stringify({total:normalized.length,committed:false})).run()}
    return {valid:errors.length===0,total:normalized.length,errors,imported:0,preview:normalized.slice(0,10)};
  }
  if(moduleName==="fleet"){
    const entitlements=await tenantEntitlements(workspace),plan=entitlements.plan,limit=entitlements.vehicleLimit,{DB}=runtimeEnv();const current=await DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0").bind(workspace.tenantId).first<{count:number}>();
    if(Number(current?.count||0)+normalized.length>limit)throw new Response(`${plan} paketinde en fazla ${limit} araç bulunabilir. Toplu aktarım paket sınırını aşıyor.`,{status:409});
  }
  const {DB}=runtimeEnv(),migrationRunId=`MIG-${crypto.randomUUID()}`,sourceSha256=input.sourceSha256||await sha256Text(JSON.stringify(normalized));
  const created=normalized.map(data=>({id:newRecordId(moduleName),module:moduleName,status:initialStatusFor(moduleName,data),data,version:1}));
  const recordIds=created.map(record=>record.id);
  // ATOMIC_BULK_IMPORT_V1: every record, audit/outbox row and migration receipt commits in one DB batch/transaction.
  await DB.batch([
    ...created.flatMap(record=>[
      DB.prepare("INSERT INTO module_records (id,tenant_id,module,status,data,created_by,updated_by) VALUES (?,?,?,?,?,?,?)").bind(record.id,workspace.tenantId,moduleName,record.status,JSON.stringify(record.data),workspace.email,workspace.email),
      DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'RECORD_CREATED',?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,moduleName,record.id,JSON.stringify({status:record.status,sourceModule:"",sourceId:"",importRunId:migrationRunId})),
      DB.prepare("INSERT INTO outbox_events (id,tenant_id,topic,payload) VALUES (?,?,?,?)").bind(`OUT-${crypto.randomUUID()}`,workspace.tenantId,`${moduleName}.created`,JSON.stringify({id:record.id,module:moduleName,status:record.status,importRunId:migrationRunId})),
    ]),
    DB.prepare("INSERT INTO migration_runs (id,tenant_id,module,source_sha256,status,total,imported,errors,duplicates,record_ids,created_by) VALUES (?,?,?,?,'COMMITTED',?,?,0,0,?,?)").bind(migrationRunId,workspace.tenantId,moduleName,sourceSha256,normalized.length,created.length,JSON.stringify(recordIds),workspace.email),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'BULK_IMPORT_COMMITTED',?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,moduleName,migrationRunId,JSON.stringify({total:normalized.length,recordIds,sourceSha256,atomic:true})),
  ]);
  return {valid:true,total:normalized.length,errors:[],imported:created.length,preview:normalized.slice(0,10),migrationRunId,status:"COMMITTED",atomic:true};
}

export async function rollbackMigrationRun(workspace:Workspace,id:string){
  assertPermission(workspace,"settings");const {DB}=runtimeEnv();const run=await DB.prepare("SELECT module,status,record_ids AS recordIds FROM migration_runs WHERE tenant_id=? AND id=?").bind(workspace.tenantId,id).first<{module:string;status:string;recordIds:string}>();if(!run)throw new Response("Veri geçiş çalışması bulunamadı.",{status:404});if(run.status!=="COMMITTED")throw new Response("Yalnız kalıcı ve daha önce geri alınmamış geçiş geri alınabilir.",{status:409});const ids=JSON.parse(run.recordIds||"[]") as string[];if(!ids.length)throw new Response("Geri alınacak kayıt kimliği yok.",{status:409});
  for(const recordId of ids){const linked=await DB.prepare("SELECT id FROM record_links WHERE tenant_id=? AND (from_id=? OR to_id=?) LIMIT 1").bind(workspace.tenantId,recordId,recordId).first();if(linked)throw new Response(`${recordId} bağlı bir operasyonda kullanıldığı için otomatik geri alınamaz.`,{status:409})}
  const statements=ids.map(recordId=>DB.prepare("UPDATE module_records SET archived=1,version=version+1,updated_by=?,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND module=? AND id=? AND archived=0").bind(workspace.email,workspace.tenantId,run.module,recordId));
  statements.push(DB.prepare("UPDATE migration_runs SET status='ROLLED_BACK',rolled_back_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=?").bind(workspace.tenantId,id));statements.push(DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'BULK_IMPORT_ROLLED_BACK',?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,run.module,id,JSON.stringify({recordIds:ids,method:"RECOVERABLE_ARCHIVE"})));await DB.batch(statements);return {id,status:"ROLLED_BACK",archived:ids.length,method:"RECOVERABLE_ARCHIVE"};
}

export async function runLocalizationSelfCheck(workspace:Workspace){
  assertPermission(workspace,"settings");
  const catalog={tr:{required:"Zorunlu alan",invalidDate:"Geçersiz tarih",tax:"Vergi"},en:{required:"Required field",invalidDate:"Invalid date",tax:"Tax"}};
  const checks=[
    {key:"CATALOG_TR_EN",passed:Object.keys(catalog.tr).every(key=>Boolean(catalog.en[key as keyof typeof catalog.en]))},
    {key:"DATE_FORMATS",passed:new Intl.DateTimeFormat("tr-TR").format(new Date("2026-03-03T12:00:00Z"))!==new Intl.DateTimeFormat("en-US").format(new Date("2026-03-03T12:00:00Z"))},
    {key:"MONEY_TRY_USD",passed:new Intl.NumberFormat("tr-TR",{style:"currency",currency:"TRY"}).format(6000).length>0&&new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(6000).includes("$")},
    {key:"DECIMAL_FORMAT",passed:new Intl.NumberFormat("tr-TR").format(1234.5)!==new Intl.NumberFormat("en-US").format(1234.5)},
    {key:"TAX_LABELS",passed:Boolean(catalog.tr.tax&&catalog.en.tax)},
    {key:"TIMEZONE",passed:new Intl.DateTimeFormat("en-US",{timeZone:"America/New_York",hour:"2-digit"}).format(new Date()).length>0},
  ];const passed=checks.every(item=>item.passed);const {DB}=runtimeEnv();await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"I18N_SELF_CHECK_PASSED":"I18N_SELF_CHECK_FAILED","settings","localization",JSON.stringify({checks,locales:["tr-TR","en-US"],currencies:["TRY","USD","EUR"]})).run();return {passed,checks,locales:["tr-TR","en-US"],executedAt:new Date().toISOString()};
}

async function latestCleanReadinessEvidence(workspace:Workspace,recordId:string){
  const {DB}=runtimeEnv();const file=await DB.prepare("SELECT id,sha256 FROM file_objects WHERE tenant_id=? AND module='readiness' AND record_id=? AND scan_status='CLEAN' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId,recordId).first<{id:string;sha256:string}>();if(!file)throw new Response(`${recordId} için temiz taramadan geçmiş kanıt dosyası yükleyin.`,{status:409});return file;
}

function fieldMetrics(rows:Array<{capturedAt:string;battery:number;receivedAt?:string}>){
  const timestamps=rows.map(row=>Date.parse(row.capturedAt)).filter(Number.isFinite).sort((a,b)=>a-b);let maxGapSeconds=0;
  for(let index=1;index<timestamps.length;index++)maxGapSeconds=Math.max(maxGapSeconds,Math.round((timestamps[index]-timestamps[index-1])/1000));
  const batterySamples=rows.map(row=>Number(row.battery)).filter(value=>Number.isFinite(value)&&value>0&&value<=100),first=batterySamples[0],last=batterySamples.at(-1),lateTelemetryCount=rows.filter(row=>row.receivedAt&&Date.parse(row.receivedAt)-Date.parse(row.capturedAt)>=60000).length;
  return {telemetryCount:rows.length,maxGapSeconds,batteryDropPercent:first===undefined||last===undefined?-1:Math.max(0,first-last),batterySampleCount:batterySamples.length,lateTelemetryCount};
}

export async function recordFieldValidation(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const kind=String(input.kind||"").trim().toUpperCase(),deviceId=String(input.deviceId||"").trim().toUpperCase(),scenario=String(input.scenario||"").trim().toUpperCase(),startedAt=String(input.startedAt||"").trim(),endedAt=String(input.endedAt||"").trim(),expectedOutcome=String(input.expectedOutcome||"").trim().toUpperCase(),observedOutcome=String(input.observedOutcome||"").trim().toUpperCase(),crashCount=Math.max(0,Number(input.crashCount||0)),permissionLossCount=Math.max(0,Number(input.permissionLossCount||0));
  const startMs=Date.parse(startedAt),endMs=Date.parse(endedAt),durationMinutes=Math.round((endMs-startMs)/60000);if(!["MOBILE","TRACKER"].includes(kind)||!deviceId||!scenario||!Number.isFinite(startMs)||!Number.isFinite(endMs)||durationMinutes<120||durationMinutes>720||!expectedOutcome||!observedOutcome)throw new Response("Test türü, cihaz, senaryo, beklenen/gözlenen sonuç ve 2–12 saatlik geçerli saha aralığı zorunludur.",{status:400});
  const {DB}=runtimeEnv();
  if(kind==="MOBILE"){
    const platform=String(input.platform||"").trim().toUpperCase(),manufacturer=String(input.manufacturer||"").trim().toUpperCase(),model=String(input.model||"").trim().toUpperCase(),osVersion=String(input.osVersion||"").trim().toUpperCase(),normalScenarios=["BACKGROUND_LOCKED","OFFLINE_RECONNECT","ENDURANCE_8H","REBOOT_RECOVERY"],limitScenario=(platform==="IOS"&&scenario==="USER_TERMINATED")||(platform==="ANDROID"&&scenario==="FORCE_STOP");if(!["IOS","ANDROID"].includes(platform)||!manufacturer||!model||!osVersion)throw new Response("Mobil saha testi için platform, üretici, model ve işletim sistemi sürümü zorunludur.",{status:400});if(platform==="IOS"&&manufacturer!=="APPLE")throw new Response("iOS fiziksel test üreticisi APPLE olmalıdır.",{status:400});if(platform==="ANDROID"&&!['SAMSUNG','XIAOMI','OPPO','PIXEL'].includes(manufacturer))throw new Response("Android matrisi Samsung, Xiaomi, Oppo veya Pixel cihazla çalıştırılmalıdır.",{status:400});if(!normalScenarios.includes(scenario)&&!limitScenario)throw new Response("Mobil senaryo BACKGROUND_LOCKED, OFFLINE_RECONNECT, ENDURANCE_8H, REBOOT_RECOVERY veya platforma uygun sonlandırma limiti olmalıdır.",{status:400});
    const installation=await DB.prepare("SELECT id,foreground_permission AS foregroundPermission,background_permission AS backgroundPermission FROM mobile_installations WHERE tenant_id=? AND device_id=? AND platform=? AND status IN ('REGISTERED','TRACKING')").bind(workspace.tenantId,deviceId,platform).first<{id:string;foregroundPermission:string;backgroundPermission:string}>();if(!installation)throw new Response("Bu platform ve cihaz için kayıtlı fiziksel mobil kurulum bulunamadı.",{status:409});
    const evidence=await latestCleanReadinessEvidence(workspace,platform==="IOS"?"RDY-MOBILE-IOS-KILLED":"RDY-MOBILE-ANDROID-OEM"),[telemetry,runtimeEvents]=await Promise.all([DB.prepare("SELECT captured_at AS capturedAt,received_at AS receivedAt,battery FROM telemetry_events WHERE tenant_id=? AND device_id=? AND source='MOBILE' AND captured_at>=? AND captured_at<=? ORDER BY captured_at ASC LIMIT 30000").bind(workspace.tenantId,deviceId,startedAt,endedAt).all<{capturedAt:string;receivedAt:string;battery:number}>(),DB.prepare("SELECT event_type AS eventType,battery_percent AS batteryPercent,details FROM mobile_runtime_events WHERE tenant_id=? AND device_id=? AND occurred_at>=? AND occurred_at<=? ORDER BY occurred_at ASC LIMIT 30000").bind(workspace.tenantId,deviceId,startedAt,endedAt).all<{eventType:string;batteryPercent:number;details:string}>()]),metrics=fieldMetrics(telemetry.results),events=runtimeEvents.results.map(event=>{try{return {...event,detail:JSON.parse(event.details||"{}") as Record<string,unknown>}}catch{return {...event,detail:{}}}}),runtimeEventCount=events.length,offlineQueueCount=events.filter(event=>event.eventType==="QUEUE_ENQUEUED").length,flushedCount=events.filter(event=>event.eventType==="QUEUE_FLUSH_COMPLETED").reduce((total,event)=>total+Math.max(0,Number(event.detail.sent||0)),0),runtimeBatterySamples=events.filter(event=>event.batteryPercent>=0&&event.batteryPercent<=100).length,batterySampleCount=Math.max(metrics.batterySampleCount,runtimeBatterySamples),queueOverflowCount=events.filter(event=>event.eventType==="QUEUE_OVERFLOW").length,recoveredCount=events.filter(event=>event.eventType==="RUNTIME_RECOVERED").length,chargingCount=events.filter(event=>String(event.detail.batteryState||"").toUpperCase()==="CHARGING").length,expectedPoints=Math.max(1,Math.floor(durationMinutes*2*.8)),permissionsOk=/GRANTED|PRECISE|WHEN_IN_USE|ALWAYS/.test(installation.foregroundPermission)&&/GRANTED|ALWAYS/.test(installation.backgroundPermission),continuous=metrics.telemetryCount>=expectedPoints&&metrics.maxGapSeconds<=300&&runtimeEventCount>0&&queueOverflowCount===0&&expectedOutcome==="CONTINUOUS_TELEMETRY"&&observedOutcome==="CONTINUOUS_TELEMETRY",limitDocumented=limitScenario&&expectedOutcome==="OS_LIMIT_DOCUMENTED"&&observedOutcome==="OS_LIMIT_DOCUMENTED",scenarioPassed=scenario==="BACKGROUND_LOCKED"?continuous:scenario==="OFFLINE_RECONNECT"?continuous&&offlineQueueCount>0&&flushedCount>0&&metrics.lateTelemetryCount>0:scenario==="ENDURANCE_8H"?continuous&&durationMinutes>=480&&batterySampleCount>=16&&metrics.batteryDropPercent>=0&&metrics.batteryDropPercent<=25&&chargingCount===0:scenario==="REBOOT_RECOVERY"?continuous&&recoveredCount>0:false,passed=!limitDocumented&&scenarioPassed&&permissionsOk&&crashCount===0&&permissionLossCount===0,id=`FLD-${crypto.randomUUID()}`,status=limitDocumented?"LIMIT_DOCUMENTED":passed?"PASSED":"FAILED",auditAction=limitDocumented?"MOBILE_FIELD_LIMIT_DOCUMENTED":passed?"MOBILE_FIELD_VALIDATION_PASSED":"MOBILE_FIELD_VALIDATION_FAILED";
    await DB.batch([DB.prepare("INSERT INTO field_validation_runs (id,tenant_id,kind,device_id,platform,manufacturer,model,os_version,scenario,expected_outcome,observed_outcome,started_at,ended_at,duration_minutes,telemetry_count,max_gap_seconds,battery_drop_percent,crash_count,permission_loss_count,runtime_event_count,offline_queue_count,flushed_count,late_telemetry_count,battery_sample_count,status,evidence_file_id,evidence_sha256,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,kind,deviceId,platform,manufacturer,model,osVersion,scenario,expectedOutcome,observedOutcome,startedAt,endedAt,durationMinutes,metrics.telemetryCount,metrics.maxGapSeconds,metrics.batteryDropPercent,crashCount,permissionLossCount,runtimeEventCount,offlineQueueCount,flushedCount,metrics.lateTelemetryCount,batterySampleCount,status,evidence.id,evidence.sha256,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,auditAction,"readiness",id,JSON.stringify({platform,manufacturer,model,osVersion,scenario,durationMinutes,...metrics,runtimeEventCount,offlineQueueCount,flushedCount,batterySampleCount,queueOverflowCount,recoveredCount,chargingCount,crashCount,permissionLossCount,evidenceSha256:evidence.sha256}))]);return {id,status,passed,limitDocumented,kind,platform,manufacturer,scenario,durationMinutes,...metrics,runtimeEventCount,offlineQueueCount,flushedCount,batterySampleCount,queueOverflowCount,recoveredCount,expectedPoints};
  }
  const provider=String(input.provider||"").trim().toUpperCase(),protocol=String(input.protocol||"").trim().toUpperCase();if(!["TELTONIKA","QUECLINK"].includes(provider)||!protocol)throw new Response("Fiziksel cihaz testi için Teltonika/Queclink sağlayıcısı ve protokol zorunludur.",{status:400});if(durationMinutes<480||scenario!=="LIVE_ROUTE_8H")throw new Response("Fiziksel GPS kabulü LIVE_ROUTE_8H senaryosunda en az 8, en fazla 12 saat çalışmalıdır.",{status:400});
  const evidence=await latestCleanReadinessEvidence(workspace,"RDY-TRACKER-LIVE"),[gateway,telemetry,connection,assignment]=await Promise.all([
    DB.prepare("SELECT COUNT(*) AS count FROM tracker_gateway_events WHERE tenant_id=? AND device_id=? AND provider=? AND status='PROCESSED' AND received_at>=? AND received_at<=?").bind(workspace.tenantId,deviceId,provider,startedAt,endedAt).first<{count:number}>(),
    DB.prepare("SELECT captured_at AS capturedAt,received_at AS receivedAt,battery FROM telemetry_events WHERE tenant_id=? AND device_id=? AND provider=? AND captured_at>=? AND captured_at<=? ORDER BY captured_at ASC LIMIT 30000").bind(workspace.tenantId,deviceId,provider,startedAt,endedAt).all<{capturedAt:string;receivedAt:string;battery:number}>(),
    DB.prepare("SELECT status FROM provider_connections WHERE tenant_id=? AND provider=?").bind(workspace.tenantId,provider==="TELTONIKA"?"TELTONIKA_GATEWAY":"QUECLINK_GATEWAY").first<{status:string}>(),
    DB.prepare("SELECT id,model_code AS modelCode,firmware_version AS firmwareVersion,last_gateway_at AS lastGatewayAt,status FROM hardware_device_assignments WHERE tenant_id=? AND device_id=? AND provider=? AND protocol=? AND status='ACTIVE' AND revoked_at IS NULL").bind(workspace.tenantId,deviceId,provider,protocol).first<{id:string;modelCode:string;firmwareVersion:string;lastGatewayAt:string;status:string}>(),
  ]),metrics=fieldMetrics(telemetry.results),gatewayEventCount=Number(gateway?.count||0),expectedPoints=Math.max(1,Math.floor(durationMinutes*2*.8)),outcomesOk=expectedOutcome==="SIGNED_GATEWAY_AND_TELEMETRY"&&observedOutcome==="SIGNED_GATEWAY_AND_TELEMETRY",passed=Boolean(assignment)&&gatewayEventCount>=8&&metrics.telemetryCount>=expectedPoints&&metrics.maxGapSeconds<=300&&connection?.status==="CONNECTED"&&outcomesOk,id=`FLD-${crypto.randomUUID()}`,status=passed?"PASSED":"FAILED";
  await DB.batch([DB.prepare("INSERT INTO field_validation_runs (id,tenant_id,kind,device_id,provider,protocol,scenario,expected_outcome,observed_outcome,started_at,ended_at,duration_minutes,telemetry_count,gateway_event_count,max_gap_seconds,battery_drop_percent,late_telemetry_count,battery_sample_count,status,evidence_file_id,evidence_sha256,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,kind,deviceId,provider,protocol,scenario,expectedOutcome,observedOutcome,startedAt,endedAt,durationMinutes,metrics.telemetryCount,gatewayEventCount,metrics.maxGapSeconds,metrics.batteryDropPercent,metrics.lateTelemetryCount,metrics.batterySampleCount,status,evidence.id,evidence.sha256,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"TRACKER_FIELD_VALIDATION_PASSED":"TRACKER_FIELD_VALIDATION_FAILED","readiness",id,JSON.stringify({provider,protocol,deviceId,scenario,durationMinutes,gatewayEventCount,expectedPoints,...metrics,assignmentId:assignment?.id||null,modelCode:assignment?.modelCode||null,firmwareVersion:assignment?.firmwareVersion||null,evidenceSha256:evidence.sha256}))]);return {id,status,passed,kind,provider,protocol,deviceId,durationMinutes,gatewayEventCount,expectedPoints,...metrics};
}

export async function recordDataAcceptance(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const migrationRunId=String(input.migrationRunId||"").trim(),sampleSize=Math.max(0,Math.floor(Number(input.sampleSize||0))),customerApprover=String(input.customerApprover||"").trim(),executedAt=String(input.executedAt||"").trim();if(!migrationRunId||sampleSize<1||customerApprover.length<5||customerApprover.toLowerCase()===workspace.email.toLowerCase()||!Number.isFinite(Date.parse(executedAt)))throw new Response("Geçiş çalışması, örneklem, farklı müşteri onaylayan ve test tarihi zorunludur.",{status:400});const evidence=await latestCleanReadinessEvidence(workspace,"RDY-DATA-MIGRATION"),{DB}=runtimeEnv(),run=await DB.prepare("SELECT module,source_sha256 AS sourceSha256,status,total,imported,errors,duplicates,record_ids AS recordIds FROM migration_runs WHERE tenant_id=? AND id=?").bind(workspace.tenantId,migrationRunId).first<{module:string;sourceSha256:string;status:string;total:number;imported:number;errors:number;duplicates:number;recordIds:string}>();if(!run||run.status!=="COMMITTED")throw new Response("Yalnız geri alınmamış kalıcı gerçek veri geçişi kabul edilebilir.",{status:409});const rollback=await DB.prepare("SELECT id FROM migration_runs WHERE tenant_id=? AND module=? AND status='ROLLED_BACK' ORDER BY rolled_back_at DESC LIMIT 1").bind(workspace.tenantId,run.module).first<{id:string}>();if(!rollback)throw new Response("Aynı modül için güvenli geri alma provası tamamlanmalıdır.",{status:409});const persisted=await DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module=? AND archived=0 AND id IN (SELECT value FROM json_each(?))").bind(workspace.tenantId,run.module,run.recordIds||"[]").first<{count:number}>(),persistedCount=Number(persisted?.count||0),minimumSample=Math.min(Math.max(1,run.imported),10),reconciled=run.total===run.imported+run.errors+run.duplicates&&persistedCount===run.imported&&run.errors===0&&sampleSize>=minimumSample,id=`DAT-${crypto.randomUUID()}`,status=reconciled?"PASSED":"FAILED",reconciliationStatus=reconciled?"MATCHED":"MISMATCH";await DB.batch([DB.prepare("INSERT INTO data_acceptance_runs (id,tenant_id,migration_run_id,rollback_run_id,module,source_sha256,source_total,imported,errors,duplicates,persisted_count,sample_size,reconciliation_status,status,customer_approver,evidence_file_id,evidence_sha256,executed_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,migrationRunId,rollback.id,run.module,run.sourceSha256,run.total,run.imported,run.errors,run.duplicates,persistedCount,sampleSize,reconciliationStatus,status,customerApprover,evidence.id,evidence.sha256,executedAt,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,reconciled?"REAL_DATA_ACCEPTANCE_PASSED":"REAL_DATA_ACCEPTANCE_FAILED","readiness",id,JSON.stringify({migrationRunId,rollbackRunId:rollback.id,module:run.module,sourceSha256:run.sourceSha256,sourceTotal:run.total,imported:run.imported,errors:run.errors,duplicates:run.duplicates,persistedCount,sampleSize,customerApprover,evidenceSha256:evidence.sha256}))]);return {id,status,passed:reconciled,reconciliationStatus,migrationRunId,rollbackRunId:rollback.id,module:run.module,sourceTotal:run.total,imported:run.imported,persistedCount,sampleSize,minimumSample};
}

export async function recordSecurityTestRun(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const evidence=await latestCleanReadinessEvidence(workspace,"RDY-SECURITY-LOAD"),tool=String(input.tool||"").trim(),scope=String(input.scope||"").trim(),externalAuditor=String(input.externalAuditor||"").trim(),executedAt=String(input.executedAt||"").trim(),concurrency=Number(input.concurrency||0),p95Ms=Number(input.p95Ms||0),p99Ms=Number(input.p99Ms||0),errorRateBps=Math.round(Number(input.errorRatePercent||0)*100),criticalCount=Math.max(0,Number(input.criticalCount||0)),highCount=Math.max(0,Number(input.highCount||0));
  const executedMs=Date.parse(executedAt),normalizedScope=scope.toLocaleUpperCase("tr-TR");if(!tool||!scope||externalAuditor.length<5||externalAuditor.toLowerCase()===workspace.email.toLowerCase()||!Number.isFinite(executedMs)||executedMs>Date.now()+300000)throw new Response("Araç, geçmiş/geçerli test tarihi ve platform hesabından farklı bağımsız denetçi zorunludur.",{status:400});if(!/(OWASP|ASVS)/.test(normalizedScope)||!/(YÜK|LOAD|PERFORMANCE|PERFORMANS)/.test(normalizedScope))throw new Response("Bağımsız kapsam OWASP/ASVS ile yük veya performans testini birlikte içermelidir.",{status:400});if(!Number.isInteger(concurrency)||concurrency<1||p95Ms<1||p99Ms<p95Ms||errorRateBps<0)throw new Response("Eşzamanlılık, p95/p99 ve hata oranı geçerli sayılar olmalıdır.",{status:400});
  const passed=concurrency>=100&&p95Ms<=500&&p99Ms<=1000&&errorRateBps<=100&&criticalCount===0&&highCount===0,id=`SEC-${crypto.randomUUID()}`,status=passed?"PASSED":"FAILED",{DB}=runtimeEnv(),statements=[];
  statements.push(DB.prepare("INSERT INTO security_test_runs (id,tenant_id,tool,scope,status,concurrency,p95_ms,p99_ms,error_rate_bps,critical_count,high_count,external_auditor,report_file_id,report_sha256,executed_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,tool,scope,status,concurrency,p95Ms,p99Ms,errorRateBps,criticalCount,highCount,externalAuditor,evidence.id,evidence.sha256,executedAt,workspace.email));
  if(criticalCount>0)statements.push(DB.prepare("INSERT INTO security_findings (id,tenant_id,run_id,severity,title,owner) VALUES (?,?,?,'CRITICAL','Bağımsız testte kritik bulgu','TEKNİK EKİP')").bind(`FND-${crypto.randomUUID()}`,workspace.tenantId,id));if(highCount>0)statements.push(DB.prepare("INSERT INTO security_findings (id,tenant_id,run_id,severity,title,owner) VALUES (?,?,?,'HIGH','Bağımsız testte yüksek bulgu','TEKNİK EKİP')").bind(`FND-${crypto.randomUUID()}`,workspace.tenantId,id));
  statements.push(DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"SECURITY_LOAD_RUN_PASSED":"SECURITY_LOAD_RUN_FAILED","security",id,JSON.stringify({tool,scope,concurrency,p95Ms,p99Ms,errorRateBps,criticalCount,highCount,externalAuditor,reportSha256:evidence.sha256})));await DB.batch(statements);return {id,status,passed,thresholds:{concurrency:100,p95Ms:500,p99Ms:1000,errorRatePercent:1,criticalCount:0,highCount:0}};
}

export async function resolveSecurityFinding(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const id=String(input.id||""),remediation=String(input.remediation||"").trim();if(remediation.length<10)throw new Response("Doğrulanmış düzeltme açıklaması en az 10 karakter olmalıdır.",{status:400});const {DB}=runtimeEnv();const result=await DB.prepare("UPDATE security_findings SET status='VERIFIED_CLOSED',remediation=?,verified_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND id=? AND status<>'VERIFIED_CLOSED'").bind(remediation,workspace.tenantId,id).run();if(!result.meta.changes)throw new Response("Açık güvenlik bulgusu bulunamadı.",{status:404});await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'SECURITY_FINDING_VERIFIED_CLOSED','security',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({remediation})).run();return {id,status:"VERIFIED_CLOSED"};
}

export async function recordPilotUat(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const evidence=await latestCleanReadinessEvidence(workspace,"RDY-PILOT-UAT"),name=String(input.name||"").trim(),customerApprover=String(input.customerApprover||"").trim(),platformApprover=String(input.platformApprover||workspace.email).trim(),executedAt=String(input.executedAt||"").trim(),executedMs=Date.parse(executedAt);if(name.length<4||customerApprover.length<5||platformApprover.length<5||customerApprover.toLowerCase()===platformApprover.toLowerCase()||!Number.isFinite(executedMs)||executedMs>Date.now()+300000)throw new Response("Pilot adı, birbirinden farklı müşteri/platform onaylayanları ve geçmiş/geçerli UAT tarihi zorunludur.",{status:400});const {DB}=runtimeEnv();
  const [companies,vehicles,commercial,telemetry,maintenance,devices,custody,signature,criticalTickets]=await Promise.all([
    DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='entities' AND archived=0").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(DISTINCT module) AS count FROM module_records WHERE tenant_id=? AND module IN ('crm','requests','offers','operations') AND archived=0").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM telemetry_events WHERE tenant_id=?").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='maintenance' AND archived=0").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='devices' AND archived=0").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='custody' AND archived=0 AND status='KAPANDI'").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM signature_requests WHERE tenant_id=? AND status='VERIFIED'").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM support_tickets WHERE tenant_id=? AND status NOT IN ('RESOLVED','CLOSED') AND priority LIKE 'KRİTİK%'").bind(workspace.tenantId).first<{count:number}>(),
  ]);const companyCount=Number(companies?.count||0),vehicleCount=Number(vehicles?.count||0),scenarios=[{code:"COMMERCIAL_FLOW",passed:Number(commercial?.count||0)===4,actual:`${Number(commercial?.count||0)}/4 modül kayıtlı`},{code:"TRACKING_MAINTENANCE",passed:Number(telemetry?.count||0)>0&&Number(maintenance?.count||0)>0,actual:`${Number(telemetry?.count||0)} telemetri · ${Number(maintenance?.count||0)} bakım`},{code:"CUSTODY_RETURN",passed:Number(devices?.count||0)>0&&Number(custody?.count||0)>0&&Number(signature?.count||0)>0,actual:`${Number(devices?.count||0)} cihaz · ${Number(custody?.count||0)} kapalı zimmet · ${Number(signature?.count||0)} imza`}],passed=companyCount>=2&&vehicleCount>=3&&scenarios.every(x=>x.passed)&&Number(criticalTickets?.count||0)===0,id=`PLT-${crypto.randomUUID()}`,status=passed?"PASSED":"FAILED";
  const statements=[DB.prepare("INSERT INTO pilot_runs (id,tenant_id,name,status,company_count,vehicle_count,customer_approver,platform_approver,customer_approved_at,platform_approved_at,evidence_file_id,created_by) VALUES (?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP,?,?)").bind(id,workspace.tenantId,name,status,companyCount,vehicleCount,customerApprover,platformApprover,evidence.id,workspace.email),...scenarios.map(item=>DB.prepare("INSERT INTO pilot_scenarios (id,tenant_id,pilot_run_id,code,expected_result,actual_result,status,blocker_severity,executed_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(`PSC-${crypto.randomUUID()}`,workspace.tenantId,id,item.code,"Uçtan uca kayıt ve kanıt zinciri",item.actual,item.passed?"PASSED":"FAILED",item.passed?"NONE":"CRITICAL",executedAt)),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"PILOT_UAT_PASSED":"PILOT_UAT_FAILED","readiness",id,JSON.stringify({companyCount,vehicleCount,scenarios,criticalBlockers:Number(criticalTickets?.count||0),evidenceSha256:evidence.sha256}))];await DB.batch(statements);return {id,status,passed,companyCount,vehicleCount,scenarios,criticalBlockers:Number(criticalTickets?.count||0)};
}

export async function recordMobileRelease(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const evidence=await latestCleanReadinessEvidence(workspace,"RDY-MOBILE-STORE"),platform=String(input.platform||"").toUpperCase(),version=String(input.version||"").trim(),buildNumber=String(input.buildNumber||"").trim(),bundleId=String(input.bundleId||"").trim(),storeStatus=String(input.storeStatus||"SUBMITTED").toUpperCase(),storeReviewId=String(input.storeReviewId||"").trim(),signingStatus=String(input.signingStatus||"PENDING").toUpperCase(),backgroundLocationStatus=String(input.backgroundLocationStatus||"PENDING").toUpperCase(),dataSafetyStatus=String(input.dataSafetyStatus||"PENDING").toUpperCase(),privacyUrl=String(input.privacyUrl||"").trim(),supportUrl=String(input.supportUrl||"").trim(),accountDeletionUrl=String(input.accountDeletionUrl||"").trim(),rollbackPlan=String(input.rollbackPlan||"").trim();
  if(!["IOS","ANDROID"].includes(platform)||!/^\d+\.\d+\.\d+$/.test(version)||!/^\d{1,9}$/.test(buildNumber)||!/^([a-zA-Z][a-zA-Z0-9_-]*\.)+[a-zA-Z][a-zA-Z0-9_-]*$/.test(bundleId))throw new Response("Platform, semantik sürüm, build numarası ve geçerli bundle/package kimliği zorunludur.",{status:400});if(!["SUBMITTED","IN_REVIEW","REJECTED","APPROVED"].includes(storeStatus)||!["PENDING","VERIFIED"].includes(signingStatus)||!["PENDING","REJECTED","ACCEPTED"].includes(backgroundLocationStatus)||!["PENDING","INCOMPLETE","COMPLETE"].includes(dataSafetyStatus))throw new Response("Mağaza, imza, arka plan konumu veya veri güvenliği sonucu geçersiz.",{status:400});for(const url of [privacyUrl,supportUrl,accountDeletionUrl]){if(!/^https:\/\//i.test(url))throw new Response("Gizlilik, destek ve hesap silme adresleri HTTPS olmalıdır.",{status:400})}if(storeReviewId.length<4||rollbackPlan.length<20)throw new Response("Mağaza inceleme kimliği ve uygulanabilir geri alma planı zorunludur.",{status:400});
  const id=`MBR-${crypto.randomUUID()}`,{DB}=runtimeEnv(),previous=await DB.prepare("SELECT bundle_id AS bundleId,store_status AS storeStatus FROM mobile_releases WHERE tenant_id=? AND platform=? AND version=? AND build_number=? ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId,platform,version,buildNumber).first<{bundleId:string;storeStatus:string}>(),platformIdentity=await DB.prepare("SELECT bundle_id AS bundleId FROM mobile_releases WHERE tenant_id=? AND platform=? ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId,platform).first<{bundleId:string}>();if(platformIdentity&&platformIdentity.bundleId!==bundleId)throw new Response("Aynı platform için bundle/package kimliği yayın geçmişi boyunca değiştirilemez.",{status:409});const allowedPrevious:Record<string,string[]>={SUBMITTED:[],IN_REVIEW:["SUBMITTED"],REJECTED:["SUBMITTED","IN_REVIEW"],APPROVED:["IN_REVIEW"]};if(storeStatus!=="SUBMITTED"&&(!previous||!allowedPrevious[storeStatus].includes(previous.storeStatus)))throw new Response(`${storeStatus} sonucu için aynı build üzerinde önceki mağaza yaşam döngüsü kaydı eksik.`,{status:409});if(previous?.storeStatus===storeStatus)throw new Response("Aynı mağaza durumu bu build için zaten kaydedildi.",{status:409});if(storeStatus==="APPROVED"&&(signingStatus!=="VERIFIED"||backgroundLocationStatus!=="ACCEPTED"||dataSafetyStatus!=="COMPLETE"))throw new Response("APPROVED için imza doğrulaması, arka plan konumu ve Data Safety tamamlanmalıdır.",{status:409});await DB.batch([DB.prepare("INSERT INTO mobile_releases (id,tenant_id,platform,version,build_number,bundle_id,store_status,store_review_id,signing_status,background_location_status,data_safety_status,privacy_url,support_url,account_deletion_url,rollback_plan,evidence_file_id,evidence_sha256,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,platform,version,buildNumber,bundleId,storeStatus,storeReviewId,signingStatus,backgroundLocationStatus,dataSafetyStatus,privacyUrl,supportUrl,accountDeletionUrl,rollbackPlan,evidence.id,evidence.sha256,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,"MOBILE_STORE_RELEASE_RECORDED","readiness",id,JSON.stringify({platform,version,buildNumber,bundleId,previousStatus:previous?.storeStatus||null,storeStatus,storeReviewId,signingStatus,backgroundLocationStatus,dataSafetyStatus,evidenceSha256:evidence.sha256}))]);return {id,platform,version,buildNumber,storeStatus,eligible:storeStatus==="APPROVED"&&signingStatus==="VERIFIED"&&backgroundLocationStatus==="ACCEPTED"&&dataSafetyStatus==="COMPLETE"};
}

export async function recordProductionRollout(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");
  const phase=String(input.phase||"").trim().toUpperCase(),targetPercent=Math.floor(Number(input.targetPercent||0)),startedAt=String(input.startedAt||"").trim(),endedAt=String(input.endedAt||"").trim(),ownerApprover=String(input.ownerApprover||"").trim(),operationsApprover=String(input.operationsApprover||"").trim(),rollbackPlan=String(input.rollbackPlan||"").trim(),rollbackTriggered=Boolean(input.rollbackTriggered);
  const phases:Record<string,{target:number;minimumMinutes:number;previous?:string}>={INTERNAL:{target:0,minimumMinutes:60},PILOT:{target:5,minimumMinutes:240,previous:"INTERNAL"},CUSTOMER_25:{target:25,minimumMinutes:720,previous:"PILOT"},GENERAL:{target:100,minimumMinutes:1440,previous:"CUSTOMER_25"}},definition=phases[phase],startMs=Date.parse(startedAt),endMs=Date.parse(endedAt),durationMinutes=Math.floor((endMs-startMs)/60000);
  if(!definition||targetPercent!==definition.target||!Number.isFinite(startMs)||!Number.isFinite(endMs)||startMs>=endMs||endMs>Date.now()+300000)throw new Response("Aşama, aşamaya ait hedef oran ve tamamlanmış gözlem aralığı geçerli olmalıdır.",{status:400});if(ownerApprover.length<5||operationsApprover.length<5||ownerApprover.toLowerCase()===operationsApprover.toLowerCase()||rollbackPlan.length<30)throw new Response("Birbirinden farklı ürün/operasyon onaylayanları ve uygulanabilir geri alma planı zorunludur.",{status:400});
  const evidence=await latestCleanReadinessEvidence(workspace,"PRODUCTION-ACTIVATION"),{DB}=runtimeEnv(),[readiness,providers,criticalIncidents,pendingOutbox,staleTelemetry,storeApprovals,previous,healthSnapshots]=await Promise.all([
    DB.prepare("SELECT COUNT(*) AS count FROM module_records WHERE tenant_id=? AND module='readiness' AND archived=0 AND status='BAŞARILI' AND id IN ("+READINESS_ORDER.map(()=>"?").join(",")+")").bind(workspace.tenantId,...READINESS_ORDER).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS total,SUM(CASE WHEN status='CONNECTED' THEN 1 ELSE 0 END) AS connected FROM provider_connections WHERE tenant_id=?").bind(workspace.tenantId).first<{total:number;connected:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM monitoring_events WHERE tenant_id=? AND severity='CRITICAL' AND detected_at>=? AND detected_at<=?").bind(workspace.tenantId,startedAt,endedAt).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM outbox_events WHERE tenant_id=? AND status IN ('PENDING','FAILED') AND created_at>=? AND created_at<=?").bind(workspace.tenantId,startedAt,endedAt).first<{count:number}>(),
    DB.prepare("SELECT COUNT(*) AS count FROM (SELECT device_id,MAX(captured_at) AS lastAt FROM telemetry_events WHERE tenant_id=? AND captured_at<=? GROUP BY device_id HAVING (julianday(?)-julianday(MAX(captured_at)))*86400>300)").bind(workspace.tenantId,endedAt,endedAt).first<{count:number}>(),
    DB.prepare("SELECT COUNT(DISTINCT platform) AS count FROM mobile_releases WHERE tenant_id=? AND platform IN ('IOS','ANDROID') AND store_status='APPROVED' AND signing_status='VERIFIED' AND background_location_status='ACCEPTED' AND data_safety_status='COMPLETE'").bind(workspace.tenantId).first<{count:number}>(),
    definition.previous?DB.prepare("SELECT id FROM production_rollouts WHERE tenant_id=? AND phase=? AND status='PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId,definition.previous).first():Promise.resolve({id:"ROOT"}),
    DB.prepare("SELECT status,checked_at AS checkedAt FROM operational_health_snapshots WHERE tenant_id=? AND checked_at>=? AND checked_at<=? ORDER BY checked_at").bind(workspace.tenantId,startedAt,endedAt).all<{status:string;checkedAt:string}>(),
  ]);
  const healthTimes=healthSnapshots.results.map(row=>Date.parse(row.checkedAt)).filter(Number.isFinite).sort((a,b)=>a-b),healthBoundaries=[startMs,...healthTimes,endMs],healthMaxGapMinutes=Math.max(...healthBoundaries.slice(1).map((time,index)=>(time-healthBoundaries[index])/60000)),healthSnapshotCount=healthTimes.length,minimumHealthSnapshots=Math.max(1,Math.floor(durationMinutes/20)),healthCoveragePassed=healthSnapshotCount>=minimumHealthSnapshots&&healthMaxGapMinutes<=20&&healthSnapshots.results.every(row=>row.status==="HEALTHY");
  const readinessPassed=Number(readiness?.count||0),readinessTotal=READINESS_ORDER.length,connectedProviders=Number(providers?.connected||0),providerTotal=Number(providers?.total||0),criticalIncidentCount=Number(criticalIncidents?.count||0),pendingOutboxCount=Number(pendingOutbox?.count||0),staleTelemetryCount=Number(staleTelemetry?.count||0),durationOk=durationMinutes>=definition.minimumMinutes,passed=!rollbackTriggered&&durationOk&&healthCoveragePassed&&readinessPassed===readinessTotal&&providerTotal>0&&connectedProviders===providerTotal&&criticalIncidentCount===0&&pendingOutboxCount===0&&staleTelemetryCount===0&&Number(storeApprovals?.count||0)===2&&Boolean(previous),status=rollbackTriggered?"ROLLED_BACK":passed?"PASSED":"FAILED",id=`ROL-${crypto.randomUUID()}`;
  await DB.batch([
    DB.prepare("INSERT INTO production_rollouts (id,tenant_id,phase,target_percent,status,started_at,ended_at,duration_minutes,readiness_passed,readiness_total,connected_providers,provider_total,critical_incident_count,pending_outbox_count,stale_telemetry_count,owner_approver,operations_approver,rollback_plan,rollback_triggered,evidence_file_id,evidence_sha256,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,phase,targetPercent,status,startedAt,endedAt,durationMinutes,readinessPassed,readinessTotal,connectedProviders,providerTotal,criticalIncidentCount,pendingOutboxCount,staleTelemetryCount,ownerApprover,operationsApprover,rollbackPlan,rollbackTriggered?1:0,evidence.id,evidence.sha256,workspace.email),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,rollbackTriggered?"PRODUCTION_ROLLOUT_ROLLED_BACK":passed?(phase==="GENERAL"?"PRODUCTION_GO_LIVE_APPROVED":"PRODUCTION_ROLLOUT_PHASE_PASSED"):"PRODUCTION_ROLLOUT_PHASE_FAILED","readiness",id,JSON.stringify({phase,targetPercent,durationMinutes,minimumMinutes:definition.minimumMinutes,healthSnapshotCount,minimumHealthSnapshots,healthMaxGapMinutes,healthCoveragePassed,readinessPassed,readinessTotal,connectedProviders,providerTotal,criticalIncidentCount,pendingOutboxCount,staleTelemetryCount,storeApprovals:Number(storeApprovals?.count||0),previousPhasePassed:Boolean(previous),ownerApprover,operationsApprover,evidenceSha256:evidence.sha256})),
  ]);
  return {id,phase,targetPercent,status,passed,durationMinutes,minimumMinutes:definition.minimumMinutes,healthSnapshotCount,minimumHealthSnapshots,healthMaxGapMinutes,healthCoveragePassed,readinessPassed,readinessTotal,connectedProviders,providerTotal,criticalIncidentCount,pendingOutboxCount,staleTelemetryCount,storeApprovals:Number(storeApprovals?.count||0),previousPhasePassed:Boolean(previous)};
}

export async function recordE2eAcceptance(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");
  const environment=String(input.environment||"").trim().toUpperCase(),baseUrl=String(input.baseUrl||"").trim(),runner=String(input.runner||"").trim(),browser=String(input.browser||"").trim(),commitSha=String(input.commitSha||"").trim().toLowerCase(),executedAt=String(input.executedAt||"").trim();
  const totals=["apiTotal","roleTotal","tenantTotal","browserTotal"].map(key=>Math.floor(Number(input[key]||0))),passedCounts=["apiPassed","rolePassed","tenantPassed","browserPassed"].map(key=>Math.floor(Number(input[key]||0)));
  if(!["STAGING","PRODUCTION"].includes(environment)||!/^https:\/\//i.test(baseUrl)||runner.length<3||browser.length<3||!/^([a-f0-9]{7,64})$/.test(commitSha)||!Number.isFinite(Date.parse(executedAt))||Date.parse(executedAt)>Date.now()+300000)throw new Response("Ortam, HTTPS adresi, bağımsız çalıştırıcı, tarayıcı, commit SHA ve tamamlanmış test tarihi zorunludur.",{status:400});
  if(totals.some(value=>value<1)||passedCounts.some((value,index)=>value<0||value>totals[index]))throw new Response("API, rol, tenant ve tarayıcı senaryolarında geçerli toplam/geçen sayıları zorunludur.",{status:400});
  const failedCount=totals.reduce((sum,total,index)=>sum+total-passedCounts[index],0),status=failedCount===0?"PASSED":"FAILED",evidence=await latestCleanReadinessEvidence(workspace,"E2E-ACCEPTANCE"),id=`E2E-${crypto.randomUUID()}`,{DB}=runtimeEnv();
  await DB.batch([
    DB.prepare("INSERT INTO e2e_acceptance_runs (id,tenant_id,environment,base_url,runner,browser,api_total,api_passed,role_total,role_passed,tenant_total,tenant_passed,browser_total,browser_passed,failed_count,status,commit_sha,evidence_file_id,evidence_sha256,executed_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,environment,baseUrl,runner,browser,totals[0],passedCounts[0],totals[1],passedCounts[1],totals[2],passedCounts[2],totals[3],passedCounts[3],failedCount,status,commitSha,evidence.id,evidence.sha256,executedAt,workspace.email),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,status==="PASSED"?"E2E_ACCEPTANCE_PASSED":"E2E_ACCEPTANCE_FAILED","readiness",id,JSON.stringify({environment,baseUrl,runner,browser,totals,passedCounts,failedCount,commitSha,evidenceSha256:evidence.sha256})),
  ]);return {id,status,failedCount,totals,passedCounts};
}

export async function importVehicleCatalog(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const version=String(input.version||"").trim().toUpperCase(),source=String(input.source||"").trim(),market=String(input.market||"").trim().toUpperCase(),rawRows=Array.isArray(input.rows)?input.rows as Array<Record<string,unknown>>:[];
  if(!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(version)||source.length<3||!market||rawRows.length<1||rawRows.length>500)throw new Response("Katalog sürümü, kaynak, pazar ve 1–500 satır zorunludur.",{status:400});
  const currentYear=new Date().getUTCFullYear()+2,seen=new Set<string>(),rows=rawRows.map((row,index)=>{const make=String(row.make||"").trim().toUpperCase(),model=String(row.model||"").trim().toUpperCase(),yearFrom=Math.floor(Number(row.yearFrom||row.year||0)),yearTo=Math.floor(Number(row.yearTo||yearFrom)),bodyType=String(row.bodyType||"").trim().toUpperCase(),fuelType=String(row.fuelType||"").trim().toUpperCase(),externalCode=String(row.externalCode||"").trim().toUpperCase(),key=`${make}|${model}|${market}|${yearFrom}`;if(make.length<2||model.length<1||yearFrom<1900||yearTo<yearFrom||yearTo>currentYear)throw new Response(`${index+1}. katalog satırında marka, model veya yıl aralığı geçersiz.`,{status:400});if(seen.has(key))throw new Response(`${index+1}. katalog satırı mükerrer.`,{status:409});seen.add(key);return {make,model,yearFrom,yearTo,bodyType,fuelType,externalCode}});
  const {DB}=runtimeEnv(),existing=await DB.prepare("SELECT id FROM vehicle_catalog_versions WHERE tenant_id=? AND version=?").bind(workspace.tenantId,version).first();if(existing)throw new Response("Bu katalog sürümü zaten kayıtlı.",{status:409});const id=`CAT-${crypto.randomUUID()}`,sourceSha256=await sha256Text(JSON.stringify({version,source,market,rows}));
  await DB.batch([DB.prepare("UPDATE vehicle_catalog_versions SET status='ARCHIVED' WHERE tenant_id=? AND status='ACTIVE'").bind(workspace.tenantId),DB.prepare("UPDATE vehicle_catalog_entries SET active=0 WHERE tenant_id=? AND active=1").bind(workspace.tenantId),DB.prepare("INSERT INTO vehicle_catalog_versions (id,tenant_id,version,source,market,status,entry_count,source_sha256,published_by) VALUES (?,?,?,?,?,'ACTIVE',?,?,?)").bind(id,workspace.tenantId,version,source,market,rows.length,sourceSha256,workspace.email),...rows.map(row=>DB.prepare("INSERT INTO vehicle_catalog_entries (id,tenant_id,version_id,make,model,year_from,year_to,market,body_type,fuel_type,external_code,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)").bind(`VCE-${crypto.randomUUID()}`,workspace.tenantId,id,row.make,row.model,row.yearFrom,row.yearTo,market,row.bodyType,row.fuelType,row.externalCode)),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'VEHICLE_CATALOG_PUBLISHED','fleet',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({version,source,market,entryCount:rows.length,sourceSha256}))]);return {id,version,entryCount:rows.length,sourceSha256,status:"ACTIVE"};
}

function numericTaxRate(value:unknown){const match=String(value||"").match(/\d+(?:[.,]\d+)?/);return match?Number(match[0].replace(",",".")):NaN}

export async function importTaxProfiles(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const version=String(input.version||"").trim().toUpperCase(),source=String(input.source||"").trim(),rawRows=Array.isArray(input.rows)?input.rows as Array<Record<string,unknown>>:[];
  if(!/^[A-Z0-9][A-Z0-9._-]{1,31}$/.test(version)||source.length<3||rawRows.length<1||rawRows.length>200)throw new Response("Vergi profil sürümü, kaynak ve 1–200 satır zorunludur.",{status:400});
  const seen=new Set<string>(),rows=rawRows.map((row,index)=>{const countryCode=String(row.countryCode||"").trim().toUpperCase(),regionCode=String(row.regionCode||"").trim().toUpperCase(),label=String(row.label||"").trim().toUpperCase(),currency=String(row.currency||"").trim().toUpperCase(),taxName=String(row.taxName||"").trim().toUpperCase(),rate=numericTaxRate(row.rate),rateBps=Math.round(rate*100),category=String(row.category||"STANDARD").trim().toUpperCase(),documentTypes=String(row.documentTypes||"INVOICE").split(/[|,]/).map(item=>item.trim().toUpperCase()).filter(Boolean),reverseCharge=Boolean(row.reverseCharge===true||String(row.reverseCharge||"").toLowerCase()==="true"),effectiveFrom=String(row.effectiveFrom||"").trim(),effectiveTo=String(row.effectiveTo||"").trim(),sourceUrl=String(row.sourceUrl||"").trim();if(!/^[A-Z]{2}$/.test(countryCode)||regionCode&&!/^[A-Z0-9_-]{1,12}$/.test(regionCode)||label.length<4||!/^[A-Z]{3}$/.test(currency)||taxName.length<2||!Number.isFinite(rate)||rate<0||rate>100||!documentTypes.length||documentTypes.some(item=>!/^[A-Z0-9_-]{2,32}$/.test(item))||!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)||effectiveTo&&!/^\d{4}-\d{2}-\d{2}$/.test(effectiveTo)||effectiveTo&&effectiveTo<effectiveFrom||!/^https:\/\//i.test(sourceUrl))throw new Response(`${index+1}. vergi profilinde ülke, etiket, para birimi, oran, belge türü, geçerlilik veya kaynak geçersiz.`,{status:400});const key=label;if(seen.has(key))throw new Response(`${index+1}. vergi profili etiketi mükerrer.`,{status:409});seen.add(key);return {countryCode,regionCode,label,currency,taxName,rateBps,category,documentTypes,reverseCharge,effectiveFrom,effectiveTo,sourceUrl}}),{DB}=runtimeEnv(),existing=await DB.prepare("SELECT id FROM tax_profile_versions WHERE tenant_id=? AND version=?").bind(workspace.tenantId,version).first();if(existing)throw new Response("Bu vergi profil sürümü zaten kayıtlı.",{status:409});const id=`TAX-${crypto.randomUUID()}`,sourceSha256=await sha256Text(JSON.stringify({version,source,rows}));
  await DB.batch([DB.prepare("UPDATE tax_profile_versions SET status='ARCHIVED' WHERE tenant_id=? AND status='ACTIVE'").bind(workspace.tenantId),DB.prepare("UPDATE tax_profile_entries SET active=0 WHERE tenant_id=? AND active=1").bind(workspace.tenantId),DB.prepare("INSERT INTO tax_profile_versions (id,tenant_id,version,source,status,entry_count,source_sha256,published_by) VALUES (?,?,?,?,'ACTIVE',?,?,?)").bind(id,workspace.tenantId,version,source,rows.length,sourceSha256,workspace.email),...rows.map(row=>DB.prepare("INSERT INTO tax_profile_entries (id,tenant_id,version_id,country_code,region_code,label,currency,tax_name,rate_bps,category,document_types,reverse_charge,effective_from,effective_to,source_url,active) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)").bind(`TXE-${crypto.randomUUID()}`,workspace.tenantId,id,row.countryCode,row.regionCode,row.label,row.currency,row.taxName,row.rateBps,row.category,JSON.stringify(row.documentTypes),row.reverseCharge?1:0,row.effectiveFrom,row.effectiveTo||null,row.sourceUrl)),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'TAX_PROFILES_PUBLISHED','settings',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({version,source,entryCount:rows.length,sourceSha256}))]);return {id,version,entryCount:rows.length,sourceSha256,status:"ACTIVE"};
}

export type ActiveTaxProfile={id:string;countryCode:string;regionCode:string;label:string;currency:string;taxName:string;rateBps:number;category:string;documentTypes:string[];reverseCharge:number;effectiveFrom:string;effectiveTo:string|null;sourceUrl:string};
type ActiveTaxProfileRow=Omit<ActiveTaxProfile,"documentTypes">&{documentTypes:string};

export async function resolveActiveTaxProfile(workspace:Workspace,data:Record<string,unknown>,required=true):Promise<ActiveTaxProfile|null>{
  const {DB}=runtimeEnv(),profileId=String(data.taxProfileId||"").trim(),label=String(data.taxJurisdiction||"").trim().toUpperCase(),today=new Date().toISOString().slice(0,10),row=await DB.prepare("SELECT id,country_code AS countryCode,region_code AS regionCode,label,currency,tax_name AS taxName,rate_bps AS rateBps,category,document_types AS documentTypes,reverse_charge AS reverseCharge,effective_from AS effectiveFrom,effective_to AS effectiveTo,source_url AS sourceUrl FROM tax_profile_entries WHERE tenant_id=? AND active=1 AND (id=? OR upper(label)=?) AND effective_from<=? AND (effective_to IS NULL OR effective_to='' OR effective_to>=?) ORDER BY effective_from DESC LIMIT 1").bind(workspace.tenantId,profileId,label,today,today).first<ActiveTaxProfileRow>();
  if(!row){if(required)throw new Response("Yayınlanmış ve yürürlükte olan sunucu vergi profili zorunludur.",{status:409});return null}const selectedRate=numericTaxRate(data.tax||data.taxRate),selectedCurrency=String(data.currency||"").toUpperCase();if(!Number.isFinite(selectedRate)||Math.round(selectedRate*100)!==Number(row.rateBps)||selectedCurrency!==row.currency)throw new Response("Teklif vergi oranı veya para birimi yürürlükteki sunucu profiliyle eşleşmiyor.",{status:409});return {...row,documentTypes:JSON.parse(String(row.documentTypes||"[]")) as string[]};
}

export async function decodeVehicleVin(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"record","fleet");const vin=String(input.vin||"").trim().toUpperCase(),modelYear=Math.floor(Number(input.modelYear||0)),countryCode=String(input.countryCode||"US").trim().toUpperCase();if(!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)||!/^[A-Z]{2}$/.test(countryCode))throw new Response("VIN 17 karakter, ülke ise ISO-2 kodu olmalı; VIN I, O ve Q içeremez.",{status:400});
  const env=runtimeEnv(),controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),8000);let decoded:Record<string,unknown>={},provider="NHTSA_VPIC";try{if(["US","CA","MX"].includes(countryCode)){const response=await fetch(`https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json${modelYear?`&modelyear=${modelYear}`:""}`,{headers:{Accept:"application/json"},signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);const payload=await response.json() as {Results?:Array<Record<string,unknown>>};decoded=payload.Results?.[0]||{}}else{if(String(env.VEHICLE_CATALOG_PROVIDER||"").toUpperCase()!=="CUSTOM_HTTP_V1"||!env.VEHICLE_CATALOG_API_URL||!env.VEHICLE_CATALOG_API_KEY||!env.VEHICLE_CATALOG_ALLOWED_HOSTS)throw new Response(`${countryCode} pazarı için yetkili yerel/OEM katalog adaptörü yapılandırılmamış.`,{status:503});const endpoint=new URL(env.VEHICLE_CATALOG_API_URL);const allowed=env.VEHICLE_CATALOG_ALLOWED_HOSTS.split(",").map(item=>item.trim().toLowerCase()).filter(Boolean);if(endpoint.protocol!=="https:"||!allowed.includes(endpoint.hostname.toLowerCase()))throw new Response("Araç katalog adaptörü HTTPS izin listesiyle eşleşmiyor.",{status:503});const response=await fetch(endpoint.toString(),{method:"POST",headers:{Authorization:`Bearer ${env.VEHICLE_CATALOG_API_KEY}`,"Content-Type":"application/json","X-Filo-Contract":"FILO_VIN_DECODE_V1"},body:JSON.stringify({vin,modelYear:modelYear||undefined,countryCode}),signal:controller.signal});if(!response.ok)throw new Error(`HTTP ${response.status}`);decoded=await response.json() as Record<string,unknown>;provider=String(decoded.provider||"CUSTOM_HTTP_V1").trim().toUpperCase()}}catch(error){if(error instanceof Response)throw error;throw new Response(`VIN katalog hizmetine ulaşılamadı: ${error instanceof Error?error.message:"bağlantı hatası"}`,{status:502})}finally{clearTimeout(timeout)}
  const errorCode=String(decoded.ErrorCode||"0"),make=String(decoded.Make||decoded.make||"").trim().toUpperCase(),model=String(decoded.Model||decoded.model||"").trim().toUpperCase(),year=Math.floor(Number(decoded.ModelYear||decoded.modelYear||modelYear||0)),market=String(decoded.PlantCountry||decoded.market||countryCode).trim().toUpperCase(),status=make&&model&&/^0/.test(errorCode)?"DECODED":"REVIEW_REQUIRED",responseDigest=await sha256Text(JSON.stringify(decoded)),id=`VIN-${crypto.randomUUID()}`,{DB}=env;
  await DB.batch([DB.prepare("INSERT INTO vin_decode_events (id,tenant_id,vin,provider,status,make,model,model_year,market,response_digest,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,vin,provider,status,make,model,year,market,responseDigest,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'VIN_DECODED','fleet',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({vin,countryCode,status,make,model,modelYear:year,provider,responseDigest}))]);return {id,vin,countryCode,status,make,model,modelYear:year,market,provider};
}

export async function saveOperationsControl(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const kind=String(input.kind||"").trim().toUpperCase(),name=String(input.name||"").trim(),ownerTeam=String(input.ownerTeam||"").trim().toUpperCase(),schedule=String(input.schedule||"").trim().toUpperCase(),targetMinutes=Math.floor(Number(input.targetMinutes||0)),escalationMinutes=Math.floor(Number(input.escalationMinutes||0)),retentionDays=Math.floor(Number(input.retentionDays||0)),runbookUrl=String(input.runbookUrl||"").trim();
  if(!["ON_CALL","ALERT","BACKUP","INCIDENT"].includes(kind)||name.length<3||ownerTeam.length<3||schedule.length<3||targetMinutes<1||escalationMinutes<targetMinutes||retentionDays<0||!/^https:\/\//i.test(runbookUrl))throw new Response("Kontrol türü, sahip ekip, takvim, hedef/escalation süreleri ve HTTPS runbook adresi geçerli olmalıdır.",{status:400});const id=`OPS-${kind}`,{DB}=runtimeEnv();
  await DB.batch([DB.prepare("INSERT INTO operations_controls (id,tenant_id,kind,name,owner_team,schedule,target_minutes,escalation_minutes,retention_days,runbook_url,active,updated_by) VALUES (?,?,?,?,?,?,?,?,?,?,1,?) ON CONFLICT(tenant_id,id) DO UPDATE SET name=excluded.name,owner_team=excluded.owner_team,schedule=excluded.schedule,target_minutes=excluded.target_minutes,escalation_minutes=excluded.escalation_minutes,retention_days=excluded.retention_days,runbook_url=excluded.runbook_url,active=1,updated_by=excluded.updated_by,updated_at=CURRENT_TIMESTAMP").bind(id,workspace.tenantId,kind,name,ownerTeam,schedule,targetMinutes,escalationMinutes,retentionDays,runbookUrl,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'OPERATIONS_CONTROL_SAVED','readiness',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({kind,name,ownerTeam,schedule,targetMinutes,escalationMinutes,retentionDays,runbookUrl}))]);return {id,kind,active:true};
}

export async function runOperationsDisciplineAudit(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"settings");const onCallOwner=String(input.onCallOwner||"").trim(),executedAt=String(input.executedAt||"").trim();if(onCallOwner.length<5||!Number.isFinite(Date.parse(executedAt))||Date.parse(executedAt)>Date.now()+300000)throw new Response("Nöbet sahibi ve tamamlanmış denetim tarihi zorunludur.",{status:400});const evidence=await latestCleanReadinessEvidence(workspace,"OPS-DISCIPLINE"),{DB}=runtimeEnv(),[controls,critical,restore]=await Promise.all([DB.prepare("SELECT COUNT(DISTINCT kind) AS count FROM operations_controls WHERE tenant_id=? AND active=1 AND kind IN ('ON_CALL','ALERT','BACKUP','INCIDENT') AND runbook_url LIKE 'https://%'").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT COUNT(*) AS count FROM monitoring_events WHERE tenant_id=? AND severity='CRITICAL' AND status<>'RESOLVED'").bind(workspace.tenantId).first<{count:number}>(),DB.prepare("SELECT created_at AS createdAt FROM restore_rehearsals WHERE tenant_id=? AND status='PASSED' ORDER BY created_at DESC LIMIT 1").bind(workspace.tenantId).first<{createdAt:string}>()]),activeControls=Number(controls?.count||0),openCriticalAlerts=Number(critical?.count||0),restoreAgeDays=restore?Math.max(0,Math.floor((Date.now()-Date.parse(restore.createdAt))/86400000)):9999,requiredControls=4,passed=activeControls===requiredControls&&openCriticalAlerts===0&&restoreAgeDays<=30,status=passed?"PASSED":"FAILED",id=`OPR-${crypto.randomUUID()}`;
  await DB.batch([DB.prepare("INSERT INTO operations_readiness_runs (id,tenant_id,status,active_controls,required_controls,open_critical_alerts,restore_age_days,on_call_owner,evidence_file_id,evidence_sha256,executed_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(id,workspace.tenantId,status,activeControls,requiredControls,openCriticalAlerts,restoreAgeDays,onCallOwner,evidence.id,evidence.sha256,executedAt,workspace.email),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,passed?"OPERATIONS_DISCIPLINE_PASSED":"OPERATIONS_DISCIPLINE_FAILED","readiness",id,JSON.stringify({activeControls,requiredControls,openCriticalAlerts,restoreAgeDays,onCallOwner,evidenceSha256:evidence.sha256}))]);return {id,status,passed,activeControls,requiredControls,openCriticalAlerts,restoreAgeDays};
}

export async function transitionSupportTicket(workspace:Workspace,id:string,status:string){
  assertPermission(workspace,"team");const next=status.toUpperCase();if(!["OPEN","IN_PROGRESS","RESOLVED","CLOSED"].includes(next))throw new Response("Geçersiz destek durumu.",{status:400});const {DB}=runtimeEnv();
  const ticket=await DB.prepare("SELECT requester_email AS requesterEmail FROM support_tickets WHERE tenant_id=? AND id=?").bind(workspace.tenantId,id).first<{requesterEmail:string}>();if(!ticket)throw new Response("Destek talebi bulunamadı.",{status:404});
  const result=await DB.prepare("UPDATE support_tickets SET status=? WHERE tenant_id=? AND id=?").bind(next,workspace.tenantId,id).run();if(!result.meta.changes)throw new Response("Destek talebi bulunamadı.",{status:404});
  await DB.batch([DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'SUPPORT_STATUS_CHANGED','support',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,id,JSON.stringify({status:next})),DB.prepare("INSERT INTO outbox_events (id,tenant_id,topic,payload) VALUES (?,?,'support.status_changed',?)").bind(`OUT-${crypto.randomUUID()}`,workspace.tenantId,JSON.stringify({id,status:next,email:ticket.requesterEmail}))]);return {id,status:next};
}

function parseOperationalDate(value:string){if(/^\d{2}\.\d{2}\.\d{4}$/.test(value)){const [day,month,year]=value.split(".");return new Date(`${year}-${month}-${day}T12:00:00Z`)}const date=new Date(value);return Number.isNaN(date.getTime())?null:date}

export async function runOperationalAutomations(workspace:Workspace){
  assertPermission(workspace,"record","tasks");const {DB}=runtimeEnv();const now=Date.now();const candidates:Array<{key:string;title:string;sourceModule:string;sourceId:string;dueDate:string;priority:string;team:string}>=[];
  const records=await DB.prepare("SELECT id,module,data FROM module_records WHERE tenant_id=? AND archived=0 AND module IN ('documents','maintenance','offers')").bind(workspace.tenantId).all<{id:string;module:string;data:string}>();
  for(const row of records.results){const data=JSON.parse(row.data||"{}") as Record<string,string>;const value=row.module==="documents"?data.expiryDate:row.module==="offers"?data.validUntil:data.targetDate||data.dueDate;const date=parseOperationalDate(value||"");if(!date)continue;const days=Math.ceil((date.getTime()-now)/86400000),threshold=row.module==="documents"?30:row.module==="maintenance"?7:3;if(days<=threshold)candidates.push({key:`${row.module}:${row.id}:${value}`,title:row.module==="documents"?`BELGE SÜRESİ YAKLAŞIYOR · ${row.id}`:row.module==="maintenance"?`BAKIM TARİHİ YAKLAŞIYOR · ${row.id}`:`TEKLİF GEÇERLİLİĞİ BİTİYOR · ${row.id}`,sourceModule:row.module,sourceId:row.id,dueDate:value,priority:days<0?"KRİTİK":"YÜKSEK",team:data.team||"OPERASYON"})}
  const stale=await DB.prepare("SELECT vehicle_id AS vehicleId,MAX(captured_at) AS capturedAt FROM telemetry_events WHERE tenant_id=? GROUP BY vehicle_id HAVING (julianday('now')-julianday(MAX(captured_at)))*86400>300").bind(workspace.tenantId).all<{vehicleId:string;capturedAt:string}>();
  for(const row of stale.results)candidates.push({key:`telemetry:${row.vehicleId}:${row.capturedAt}`,title:`TELEMETRİ KESİNTİSİ · ${row.vehicleId}`,sourceModule:"fleet",sourceId:row.vehicleId,dueDate:new Date().toISOString().slice(0,10),priority:"KRİTİK",team:"TEKNİK EKİP"});
  let created=0,skipped=0;for(const item of candidates.slice(0,50)){const exists=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='tasks' AND archived=0 AND json_extract(data,'$.automationKey')=?").bind(workspace.tenantId,item.key).first();if(exists){skipped++;continue}await saveRecord(workspace,{module:"tasks",data:{title:item.title,assignee:item.team,team:item.team,dueDate:item.dueDate,priority:item.priority,source:`${item.sourceModule}:${item.sourceId}`,automationKey:item.key,status:"AÇIK"}});created++}
  await DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'AUTOMATION_RUN','tasks','automation-engine',?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,JSON.stringify({candidates:candidates.length,created,skipped})).run();return {candidates:candidates.length,created,skipped};
}

export async function scheduledTenantWorkspaces(limit=100,slot=new Date().toISOString()){
  const safeLimit=Math.max(1,Math.min(100,Math.floor(limit))),{DB}=runtimeEnv(),count=await DB.prepare("SELECT COUNT(*) AS count FROM tenants t WHERE EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id=t.id AND tm.role='Owner' AND tm.active=1)").first<{count:number}>(),total=Math.max(0,Number(count?.count||0));
  if(!total)return {workspaces:[],hasMore:false,total:0,offset:0,nextOffset:0};
  const slotIndex=Math.max(0,Math.floor(Date.parse(slot)/900000)),offset=(slotIndex*safeLimit)%total,first=await DB.prepare("SELECT t.id AS tenantId,t.name AS tenantName FROM tenants t WHERE EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id=t.id AND tm.role='Owner' AND tm.active=1) ORDER BY t.id LIMIT ? OFFSET ?").bind(safeLimit,offset).all<{tenantId:string;tenantName:string}>(),remaining=safeLimit-first.results.length,wrapped=remaining>0?await DB.prepare("SELECT t.id AS tenantId,t.name AS tenantName FROM tenants t WHERE EXISTS (SELECT 1 FROM tenant_members tm WHERE tm.tenant_id=t.id AND tm.role='Owner' AND tm.active=1) ORDER BY t.id LIMIT ?").bind(remaining).all<{tenantId:string;tenantName:string}>():{results:[] as Array<{tenantId:string;tenantName:string}>},rows=[...first.results,...wrapped.results];
  return {workspaces:rows.map(row=>({tenantId:row.tenantId,tenantName:row.tenantName,email:"system:operations-cron",name:"FILO OPERATIONS CRON",role:"Owner",authSource:"SYSTEM",assuranceLevel:"system"} satisfies Workspace)),hasMore:total>safeLimit,total,offset,nextOffset:(offset+safeLimit)%total};
}

export async function claimScheduledJob(workspace:Workspace,jobName:string,slot:string){
  const {DB}=runtimeEnv(),digest=await sha256Text(`${workspace.tenantId}:${jobName}:${slot}`),id=`SJR-${digest.slice(0,32).toUpperCase()}`;
  await DB.prepare("INSERT OR IGNORE INTO scheduled_job_runs (id,tenant_id,job_name,slot,status) VALUES (?,?,?,?,'PENDING')").bind(id,workspace.tenantId,jobName,slot).run();
  const claimed=await DB.prepare("UPDATE scheduled_job_runs SET status='RUNNING',attempt=attempt+1,started_at=CURRENT_TIMESTAMP,completed_at=NULL,last_error='',updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND (status IN ('PENDING','FAILED') OR (status='RUNNING' AND started_at<datetime('now','-30 minutes')))").bind(id,workspace.tenantId).run();
  return claimed.meta.changes?{id,jobName,slot}:null;
}

export async function finishScheduledJob(workspace:Workspace,id:string,status:"COMPLETED"|"FAILED",result:Record<string,unknown>,lastError=""){
  const {DB}=runtimeEnv(),safeResult=JSON.stringify(result).slice(0,8000),safeError=lastError.slice(0,1000);
  await DB.batch([
    DB.prepare("UPDATE scheduled_job_runs SET status=?,result=?,last_error=?,completed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND tenant_id=? AND status='RUNNING'").bind(status,safeResult,safeError,id,workspace.tenantId),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,?,?,?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,status==="COMPLETED"?"SCHEDULED_OPERATIONS_COMPLETED":"SCHEDULED_OPERATIONS_FAILED","tasks",id,JSON.stringify({status,...result,error:safeError})),
  ]);
}

async function sha256Text(value:string){const bytes=new TextEncoder().encode(value);const digest=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(digest)].map(x=>x.toString(16).padStart(2,"0")).join("");}

const HARDWARE_DEVICE_PROFILES={
  "TELTONIKA:FMC920":{provider:"TELTONIKA",modelCode:"FMC920",protocol:"CODEC8E",transport:"TCP_MQTT_HTTPS"},
  "QUECLINK:GV57MG PLUS":{provider:"QUECLINK",modelCode:"GV57MG_PLUS",protocol:"ATRACK_PROFILE_V1",transport:"TCP_MQTT_HTTPS"},
} as const;

function luhnValid(value:string){if(!/^\d+$/.test(value))return false;let total=0,doubleDigit=false;for(let index=value.length-1;index>=0;index--){let digit=Number(value[index]);if(doubleDigit){digit*=2;if(digit>9)digit-=9}total+=digit;doubleDigit=!doubleDigit}return total%10===0}

export async function provisionHardwareDevice(workspace:Workspace,input:Record<string,unknown>){
  assertPermission(workspace,"provider");const {DB}=runtimeEnv(),deviceId=String(input.deviceId||"").trim().toLocaleUpperCase("tr-TR"),vehicleId=String(input.vehicleId||"").trim().toLocaleUpperCase("tr-TR"),provider=String(input.provider||"").trim().toLocaleUpperCase("tr-TR"),model=String(input.model||"").trim().toLocaleUpperCase("tr-TR").replaceAll("_"," "),imei=String(input.imei||"").trim(),iccid=String(input.iccid||"").trim(),msisdn=String(input.msisdn||"").trim(),operator=String(input.operator||"").trim().toLocaleUpperCase("tr-TR"),apn=String(input.apn||"").trim(),firmwareVersion=String(input.firmwareVersion||"").trim();
  const profile=HARDWARE_DEVICE_PROFILES[`${provider}:${model}` as keyof typeof HARDWARE_DEVICE_PROFILES];if(!deviceId||!vehicleId||!profile)throw new Response("Pilot donanım profili TELTONIKA FMC920 veya QUECLINK GV57MG PLUS ve aktif araç ataması olmalıdır.",{status:400});if(!/^\d{15}$/.test(imei)||!luhnValid(imei))throw new Response("IMEI 15 haneli ve Luhn doğrulamasından geçmiş olmalıdır.",{status:400});if(!/^\d{18,22}$/.test(iccid)||!luhnValid(iccid))throw new Response("SIM ICCID 18–22 haneli ve Luhn doğrulamasından geçmiş olmalıdır.",{status:400});if(msisdn&&!/^\+?\d{10,15}$/.test(msisdn))throw new Response("SIM hat numarası E.164 biçiminde olmalıdır.",{status:400});if(operator.length<2||apn.length<2||firmwareVersion.length<2)throw new Response("SIM operatörü, APN ve cihaz firmware sürümü zorunludur.",{status:400});
  const [device,vehicle,tracker,imeiOwner,vehicleOwner]=await Promise.all([
    DB.prepare("SELECT id,data FROM module_records WHERE tenant_id=? AND module='devices' AND archived=0 AND (id=? OR upper(json_extract(data,'$.assetId'))=?)").bind(workspace.tenantId,deviceId,deviceId).first<{id:string;data:string}>(),
    DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0 AND (id=? OR upper(json_extract(data,'$.plate'))=?)").bind(workspace.tenantId,vehicleId,vehicleId).first<{id:string}>(),
    DB.prepare("SELECT id,data FROM module_records WHERE tenant_id=? AND module='trackers' AND archived=0 AND json_extract(data,'$.imei')=? AND upper(json_extract(data,'$.provider')) LIKE ? LIMIT 1").bind(workspace.tenantId,imei,`%${provider}%`).first<{id:string;data:string}>(),
    DB.prepare("SELECT device_id AS deviceId FROM hardware_device_assignments WHERE tenant_id=? AND imei=? AND status<>'REVOKED' LIMIT 1").bind(workspace.tenantId,imei).first<{deviceId:string}>(),
    DB.prepare("SELECT device_id AS deviceId FROM hardware_device_assignments WHERE tenant_id=? AND vehicle_id=? AND status IN ('PROVISIONED','ACTIVE') AND device_id<>? LIMIT 1").bind(workspace.tenantId,vehicleId,deviceId).first<{deviceId:string}>(),
  ]);
  if(!device||!vehicle||!tracker)throw new Response("Cihaz envanteri, aynı IMEI'li takip adaptörü ve aktif araç kaydı birlikte bulunmalıdır.",{status:409});const deviceData=JSON.parse(device.data||"{}") as Record<string,string>;if(String(deviceData.deviceType||"").toLocaleUpperCase("tr-TR").includes("TELEFON"))throw new Response("Telefon envanteri fiziksel GPS gateway profiline atanamaz.",{status:409});if(String(deviceData.imei||"")!==imei||String(deviceData.iccid||"")!==iccid)throw new Response("IMEI ve ICCID cihaz envanteriyle birebir eşleşmelidir.",{status:409});if(imeiOwner&&imeiOwner.deviceId!==deviceId)throw new Response("IMEI başka bir aktif cihaz atamasında kullanılıyor.",{status:409});if(vehicleOwner)throw new Response("Araçta farklı bir aktif fiziksel takip cihazı ataması bulunuyor.",{status:409});
  const simId=`SIM-${crypto.randomUUID()}`,assignmentId=`HWA-${crypto.randomUUID()}`;await DB.batch([
    DB.prepare("INSERT INTO hardware_sim_cards (id,tenant_id,iccid,msisdn,operator,apn,status,activated_at,created_by,updated_at) VALUES (?,?,?,?,?,?,'ACTIVE',CURRENT_TIMESTAMP,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,iccid) DO UPDATE SET msisdn=excluded.msisdn,operator=excluded.operator,apn=excluded.apn,status='ACTIVE',suspended_at=NULL,updated_at=CURRENT_TIMESTAMP").bind(simId,workspace.tenantId,iccid,msisdn,operator,apn,workspace.email),
    DB.prepare("INSERT INTO hardware_device_assignments (id,tenant_id,device_id,vehicle_id,imei,iccid,provider,model_code,protocol,transport,status,firmware_version,assigned_by,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,'PROVISIONED',?,?,CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,device_id) DO UPDATE SET vehicle_id=excluded.vehicle_id,imei=excluded.imei,iccid=excluded.iccid,provider=excluded.provider,model_code=excluded.model_code,protocol=excluded.protocol,transport=excluded.transport,status='PROVISIONED',firmware_version=excluded.firmware_version,assigned_by=excluded.assigned_by,assigned_at=CURRENT_TIMESTAMP,revoked_at=NULL,updated_at=CURRENT_TIMESTAMP").bind(assignmentId,workspace.tenantId,deviceId,vehicleId,imei,iccid,profile.provider,profile.modelCode,profile.protocol,profile.transport,firmwareVersion,workspace.email),
    DB.prepare("UPDATE device_ingest_tokens SET active=0 WHERE tenant_id=? AND device_id=? AND provider<>'MOBILE'").bind(workspace.tenantId,deviceId),
    DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'HARDWARE_DEVICE_PROVISIONED','devices',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,deviceId,JSON.stringify({vehicleId,provider,modelCode:profile.modelCode,protocol:profile.protocol,transport:profile.transport,imeiSuffix:imei.slice(-4),iccidSuffix:iccid.slice(-4),firmwareVersion,trackerId:tracker.id})),
  ]);return {id:assignmentId,deviceId,vehicleId,provider,modelCode:profile.modelCode,protocol:profile.protocol,transport:profile.transport,status:"PROVISIONED"};
}

export async function issueDeviceToken(workspace:Workspace,input:string|{deviceId:string;provider?:string;protocol?:string}){
  assertPermission(workspace,"provider");const {DB}=runtimeEnv();const deviceId=typeof input==="string"?input:String(input.deviceId||"").trim().toLocaleUpperCase("tr-TR"),provider=(typeof input==="string"?"MOBILE":String(input.provider||"MOBILE")).trim().toLocaleUpperCase("tr-TR"),protocol=(typeof input==="string"?"HTTPS_JSON_V1":String(input.protocol||"HTTPS_JSON_V1")).trim().toLocaleUpperCase("tr-TR");
  if(!["MOBILE","TELTONIKA","QUECLINK","GENERIC_HTTP"].includes(provider))throw new Response("Desteklenmeyen telemetri sağlayıcısı.",{status:400});
  if(!/^[A-Z0-9_.-]{3,40}$/.test(protocol))throw new Response("Geçerli protokol profili zorunludur.",{status:400});
  const device=await DB.prepare("SELECT id,data FROM module_records WHERE tenant_id=? AND module='devices' AND (id=? OR upper(json_extract(data,'$.assetId'))=?) AND archived=0").bind(workspace.tenantId,deviceId,deviceId).first<{id:string;data:string}>();if(!device)throw new Response("Cihaz kaydı bulunamadı.",{status:404});
  const deviceData=JSON.parse(device.data||"{}") as Record<string,string>,deviceType=String(deviceData.deviceType||"").toLocaleUpperCase("tr-TR");
  if(provider==="MOBILE"&&!deviceType.includes("TELEFON"))throw new Response("Mobil uygulama anahtarı yalnız telefon envanteri için üretilebilir.",{status:409});
  if(provider!=="MOBILE"&&deviceType.includes("TELEFON"))throw new Response("Donanım gateway anahtarı telefon envanterine atanamaz.",{status:409});
  if(provider!=="MOBILE"){const assignment=await DB.prepare("SELECT id FROM hardware_device_assignments WHERE tenant_id=? AND device_id=? AND provider=? AND protocol=? AND status='PROVISIONED' AND revoked_at IS NULL").bind(workspace.tenantId,deviceId,provider,protocol).first();if(!assignment)throw new Response("Önce IMEI, SIM, model, firmware ve araç atamasını içeren donanım provizyonunu tamamlayın.",{status:409})}
  const token=`flt_${crypto.randomUUID().replaceAll("-","")}${crypto.randomUUID().replaceAll("-","")}`,hash=await sha256Text(token),id=`DTK-${crypto.randomUUID()}`;const expires=new Date(Date.now()+365*86400000).toISOString();
  const connectionProvider=provider==="TELTONIKA"?"TELTONIKA_GATEWAY":provider==="QUECLINK"?"QUECLINK_GATEWAY":"DEVICE_TELEMETRY";
  await DB.batch([DB.prepare("UPDATE device_ingest_tokens SET active=0 WHERE tenant_id=? AND device_id=? AND provider=?").bind(workspace.tenantId,deviceId,provider),DB.prepare("INSERT INTO device_ingest_tokens (id,tenant_id,device_id,token_hash,provider,protocol,expires_at) VALUES (?,?,?,?,?,?,?)").bind(id,workspace.tenantId,deviceId,hash,provider,protocol,expires),DB.prepare("UPDATE provider_connections SET status='CONFIG_PRESENT',last_check_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND provider=? AND status<>'CONNECTED'").bind(workspace.tenantId,connectionProvider),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,?,'DEVICE_CREDENTIAL_ISSUED','devices',?,?)").bind(`AUD-${crypto.randomUUID()}`,workspace.tenantId,workspace.email,deviceId,JSON.stringify({provider,protocol,expiresAt:expires}))]);return {id,token,deviceId,provider,protocol,expiresAt:expires};
}

export async function workspaceForDeviceToken(token:string){
  const hash=await sha256Text(token);const {DB}=runtimeEnv();const row=await DB.prepare("SELECT d.tenant_id AS tenantId,d.device_id AS deviceId,d.provider,d.protocol,t.name AS tenantName,h.imei,h.vehicle_id AS vehicleId,h.model_code AS modelCode,h.status AS assignmentStatus FROM device_ingest_tokens d JOIN tenants t ON t.id=d.tenant_id LEFT JOIN hardware_device_assignments h ON h.tenant_id=d.tenant_id AND h.device_id=d.device_id AND h.provider=d.provider AND h.protocol=d.protocol AND h.revoked_at IS NULL WHERE d.token_hash=? AND d.active=1 AND d.expires_at>CURRENT_TIMESTAMP").bind(hash).first<{tenantId:string;deviceId:string;provider:string;protocol:string;tenantName:string;imei?:string;vehicleId?:string;modelCode?:string;assignmentStatus?:string}>();if(!row)throw new Response("Geçersiz veya süresi dolmuş cihaz anahtarı.",{status:401});if(row.provider!=="MOBILE"&&row.assignmentStatus!=="PROVISIONED"&&row.assignmentStatus!=="ACTIVE")throw new Response("Fiziksel cihaz ataması aktif değil.",{status:403});return row;
}

type DeviceWorkspace=Awaited<ReturnType<typeof workspaceForDeviceToken>>;
const mobilePermission=(value:unknown)=>String(value||"UNKNOWN").trim().toLocaleUpperCase("tr-TR");

export async function registerMobileInstallation(device:DeviceWorkspace,input:Record<string,unknown>){
  if(device.provider!=="MOBILE")throw new Response("Bu anahtar mobil kurulum için yetkili değildir.",{status:403});
  const platform=mobilePermission(input.platform),osVersion=String(input.osVersion||"").trim(),appVersion=String(input.appVersion||"").trim(),driverId=String(input.driverId||"").trim().toLocaleUpperCase("tr-TR"),deviceModel=String(input.deviceModel||"").trim().toLocaleUpperCase("tr-TR");
  if(!["IOS","ANDROID"].includes(platform)||!osVersion||!/^\d+\.\d+\.\d+([+-][A-Za-z0-9.-]+)?$/.test(appVersion)||!driverId)throw new Response("Platform, işletim sistemi, semantik uygulama sürümü ve sürücü zorunludur.",{status:400});
  const {DB}=runtimeEnv();const driver=await DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='drivers' AND archived=0 AND (id=? OR upper(json_extract(data,'$.name'))=?)").bind(device.tenantId,driverId,driverId).first();if(!driver)throw new Response("Sürücü bu çalışma alanında bulunamadı.",{status:404});
  const id=`MBL-${crypto.randomUUID()}`,pushToken=String(input.pushToken||"").trim(),pushTokenStatus=/^(Expo|Exponent)PushToken\[[A-Za-z0-9_-]+\]$/.test(pushToken)?"REGISTERED":"UNREGISTERED";const permissions={foregroundPermission:mobilePermission(input.foregroundPermission),backgroundPermission:mobilePermission(input.backgroundPermission),foregroundService:platform==="ANDROID"?mobilePermission(input.foregroundService):"NOT_APPLICABLE",batteryOptimization:mobilePermission(input.batteryOptimization),notificationPermission:mobilePermission(input.notificationPermission)};
  await DB.batch([DB.prepare("INSERT INTO mobile_installations (id,tenant_id,device_id,driver_id,platform,os_version,app_version,device_model,foreground_permission,background_permission,foreground_service,battery_optimization,notification_permission,push_token,push_token_status,status,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'REGISTERED',CURRENT_TIMESTAMP) ON CONFLICT(tenant_id,device_id) DO UPDATE SET driver_id=excluded.driver_id,platform=excluded.platform,os_version=excluded.os_version,app_version=excluded.app_version,device_model=excluded.device_model,foreground_permission=excluded.foreground_permission,background_permission=excluded.background_permission,foreground_service=excluded.foreground_service,battery_optimization=excluded.battery_optimization,notification_permission=excluded.notification_permission,push_token=excluded.push_token,push_token_status=excluded.push_token_status,status='REGISTERED',updated_at=CURRENT_TIMESTAMP").bind(id,device.tenantId,device.deviceId,driverId,platform,osVersion,appVersion,deviceModel,permissions.foregroundPermission,permissions.backgroundPermission,permissions.foregroundService,permissions.batteryOptimization,permissions.notificationPermission,pushToken,pushTokenStatus),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'device:mobile','MOBILE_INSTALLATION_REGISTERED','devices',?,?)").bind(`AUD-${crypto.randomUUID()}`,device.tenantId,device.deviceId,JSON.stringify({platform,osVersion,appVersion,driverId,...permissions,pushTokenStatus}))]);
  return {deviceId:device.deviceId,driverId,platform,osVersion,appVersion,...permissions,pushTokenStatus,status:"REGISTERED"};
}

export async function startMobileTrackingSession(device:DeviceWorkspace,input:Record<string,unknown>){
  if(device.provider!=="MOBILE")throw new Response("Bu anahtar mobil vardiya için yetkili değildir.",{status:403});const {DB}=runtimeEnv();const vehicleId=String(input.vehicleId||"").trim().toLocaleUpperCase("tr-TR");
  const [installation,vehicle,legal,notice,active]=await Promise.all([DB.prepare("SELECT driver_id AS driverId,platform,foreground_permission AS foregroundPermission,background_permission AS backgroundPermission,foreground_service AS foregroundService,battery_optimization AS batteryOptimization,notification_permission AS notificationPermission FROM mobile_installations WHERE tenant_id=? AND device_id=?").bind(device.tenantId,device.deviceId).first<{driverId:string;platform:string;foregroundPermission:string;backgroundPermission:string;foregroundService:string;batteryOptimization:string;notificationPermission:string}>(),DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='fleet' AND archived=0 AND (id=? OR upper(json_extract(data,'$.plate'))=?)").bind(device.tenantId,vehicleId,vehicleId).first<{id:string}>(),DB.prepare("SELECT status,location_purposes AS locationPurposes FROM legal_profiles WHERE tenant_id=?").bind(device.tenantId).first<{status:string;locationPurposes:string}>(),DB.prepare("SELECT id FROM module_records WHERE tenant_id=? AND module='custody' AND archived=0 AND (upper(json_extract(data,'$.asset'))=? OR upper(json_extract(data,'$.recipient'))=(SELECT upper(json_extract(data,'$.name')) FROM module_records WHERE tenant_id=? AND module='drivers' AND id=(SELECT driver_id FROM mobile_installations WHERE tenant_id=? AND device_id=?))) AND (json_extract(data,'$.noticeStatus')='TEBLİĞ EDİLDİ' OR json_extract(data,'$.trackingNotice')='UYGULANMAZ') LIMIT 1").bind(device.tenantId,device.deviceId,device.tenantId,device.tenantId,device.deviceId).first(),DB.prepare("SELECT id FROM tracking_sessions WHERE tenant_id=? AND device_id=? AND status='ACTIVE' LIMIT 1").bind(device.tenantId,device.deviceId).first()]);
  if(!installation||!vehicle)throw new Response("Mobil kurulum ve aktif araç kaydı zorunludur.",{status:409});if(active)throw new Response("Bu cihazda zaten aktif bir takip oturumu var.",{status:409});if(legal?.status!=="APPROVED"||!legal.locationPurposes)throw new Response("Onaylı hukuk profili ve konum işleme amacı olmadan takip başlatılamaz.",{status:409});if(!notice)throw new Response("Sürücü/cihaz için konum bildirimi tebliğ edilmeden takip başlatılamaz.",{status:409});
  const foregroundOk=/GRANTED|PRECISE|WHEN_IN_USE|ALWAYS/.test(installation.foregroundPermission),backgroundOk=/GRANTED|ALWAYS/.test(installation.backgroundPermission),serviceOk=installation.platform!=="ANDROID"||installation.foregroundService==="ACTIVE";if(!foregroundOk||!backgroundOk||!serviceOk)throw new Response("Arka plan konumu için gerekli işletim sistemi izinleri tamamlanmamış.",{status:409});
  const id=`SES-${crypto.randomUUID()}`,snapshot={platform:installation.platform,foregroundPermission:installation.foregroundPermission,backgroundPermission:installation.backgroundPermission,foregroundService:installation.foregroundService,batteryOptimization:installation.batteryOptimization,notificationPermission:installation.notificationPermission};await DB.batch([DB.prepare("INSERT INTO tracking_sessions (id,tenant_id,device_id,vehicle_id,driver_id,source,provider,status,permission_snapshot,last_seen_at) VALUES (?,?,?,?,?,'MOBILE','FILO_DRIVER','ACTIVE',?,CURRENT_TIMESTAMP)").bind(id,device.tenantId,device.deviceId,vehicleId,installation.driverId,JSON.stringify(snapshot)),DB.prepare("UPDATE mobile_installations SET status='TRACKING',last_heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND device_id=?").bind(device.tenantId,device.deviceId),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'device:mobile','MOBILE_TRACKING_STARTED','operations',?,?)").bind(`AUD-${crypto.randomUUID()}`,device.tenantId,id,JSON.stringify({vehicleId,deviceId:device.deviceId,driverId:installation.driverId,snapshot}))]);return {id,vehicleId,driverId:installation.driverId,status:"ACTIVE",permissionSnapshot:snapshot};
}

export async function mobileHeartbeat(device:DeviceWorkspace,input:Record<string,unknown>){
  if(device.provider!=="MOBILE")throw new Response("Bu anahtar mobil heartbeat için yetkili değildir.",{status:403});const {DB}=runtimeEnv(),sessionId=String(input.sessionId||"");const result=await DB.prepare("UPDATE tracking_sessions SET last_seen_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND device_id=? AND id=? AND status='ACTIVE'").bind(device.tenantId,device.deviceId,sessionId).run();if(!result.meta.changes)throw new Response("Aktif mobil takip oturumu bulunamadı.",{status:404});await DB.prepare("UPDATE mobile_installations SET last_heartbeat_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND device_id=?").bind(device.tenantId,device.deviceId).run();return {sessionId,status:"ACTIVE",receivedAt:new Date().toISOString()};
}

const MOBILE_RUNTIME_EVENT_TYPES=new Set(["APP_STATE","NETWORK_STATE","LOCATION_BATCH","QUEUE_ENQUEUED","QUEUE_FLUSH_STARTED","QUEUE_FLUSH_COMPLETED","BATTERY_SAMPLE","SHIFT_STARTED","SHIFT_STOPPED","RUNTIME_RECOVERED","TERMINATION_LIMIT_ACKNOWLEDGED","QUEUE_OVERFLOW"]);
export async function recordMobileRuntimeEvent(device:DeviceWorkspace,input:Record<string,unknown>){
  if(device.provider!=="MOBILE")throw new Response("Bu anahtar mobil tanılama için yetkili değildir.",{status:403});
  const eventId=String(input.eventId||"").trim(),sessionId=String(input.sessionId||"").trim(),eventType=String(input.eventType||"").trim().toUpperCase(),occurredAt=String(input.occurredAt||"").trim(),sequence=Math.max(0,Math.round(Number(input.sequence)||0)),batteryPercent=Math.round(Number(input.batteryPercent)),queueDepth=Math.max(0,Math.round(Number(input.queueDepth)||0)),networkType=String(input.networkType||"UNKNOWN").trim().toUpperCase().slice(0,40),appState=String(input.appState||"UNKNOWN").trim().toUpperCase().slice(0,40),details=input.details&&typeof input.details==="object"?input.details:{};
  const occurredMs=Date.parse(occurredAt),detailsJson=JSON.stringify(details);if(!/^MEV-[A-Za-z0-9-]{10,80}$/.test(eventId)||!sessionId||!MOBILE_RUNTIME_EVENT_TYPES.has(eventType)||!Number.isFinite(occurredMs)||occurredMs>Date.now()+300000||occurredMs<Date.now()-30*86400000||sequence<1||queueDepth>10000||!Number.isFinite(batteryPercent)||batteryPercent<-1||batteryPercent>100||detailsJson.length>4096)throw new Response("Mobil tanılama kimliği, oturum, tür, sıra, tarih, pil, kuyruk ve ayrıntılar geçerli olmalıdır.",{status:400});
  const {DB}=runtimeEnv(),session=await DB.prepare("SELECT id FROM tracking_sessions WHERE tenant_id=? AND device_id=? AND id=? AND source='MOBILE'").bind(device.tenantId,device.deviceId,sessionId).first();if(!session)throw new Response("Tanılama olayı bu cihaza ait bir mobil oturumla eşleşmiyor.",{status:409});
  const result=await DB.prepare("INSERT OR IGNORE INTO mobile_runtime_events (id,tenant_id,device_id,session_id,event_type,sequence,battery_percent,queue_depth,network_type,app_state,details,occurred_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)").bind(eventId,device.tenantId,device.deviceId,sessionId,eventType,sequence,batteryPercent,queueDepth,networkType,appState,detailsJson,occurredAt).run();
  return {id:eventId,sessionId,eventType,duplicate:!result.meta.changes,receivedAt:new Date().toISOString()};
}


export async function stopMobileTrackingSession(device:DeviceWorkspace,input:Record<string,unknown>){
  if(device.provider!=="MOBILE")throw new Response("Bu anahtar mobil vardiya için yetkili değildir.",{status:403});const {DB}=runtimeEnv(),sessionId=String(input.sessionId||"");const result=await DB.prepare("UPDATE tracking_sessions SET status='ENDED',ended_at=CURRENT_TIMESTAMP,last_seen_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND device_id=? AND id=? AND status='ACTIVE'").bind(device.tenantId,device.deviceId,sessionId).run();if(!result.meta.changes)throw new Response("Aktif mobil takip oturumu bulunamadı.",{status:404});await DB.batch([DB.prepare("UPDATE mobile_installations SET status='REGISTERED',updated_at=CURRENT_TIMESTAMP WHERE tenant_id=? AND device_id=?").bind(device.tenantId,device.deviceId),DB.prepare("INSERT INTO audit_events (id,tenant_id,actor_email,action,module,record_id,payload) VALUES (?,?,'device:mobile','MOBILE_TRACKING_STOPPED','operations',?,?)").bind(`AUD-${crypto.randomUUID()}`,device.tenantId,sessionId,JSON.stringify({deviceId:device.deviceId}))]);return {sessionId,status:"ENDED"};
}

export async function mobileRuntimeStatus(device:DeviceWorkspace){
  if(device.provider!=="MOBILE")throw new Response("Bu anahtar mobil durum sorgusu için yetkili değildir.",{status:403});const {DB}=runtimeEnv();const [installation,session]=await Promise.all([DB.prepare("SELECT device_id AS deviceId,driver_id AS driverId,platform,os_version AS osVersion,app_version AS appVersion,device_model AS deviceModel,foreground_permission AS foregroundPermission,background_permission AS backgroundPermission,foreground_service AS foregroundService,battery_optimization AS batteryOptimization,notification_permission AS notificationPermission,status,last_heartbeat_at AS lastHeartbeatAt FROM mobile_installations WHERE tenant_id=? AND device_id=?").bind(device.tenantId,device.deviceId).first(),DB.prepare("SELECT id,vehicle_id AS vehicleId,driver_id AS driverId,status,started_at AS startedAt,last_seen_at AS lastSeenAt FROM tracking_sessions WHERE tenant_id=? AND device_id=? AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1").bind(device.tenantId,device.deviceId).first()]);return {installation:installation||null,session:session||null};
}
