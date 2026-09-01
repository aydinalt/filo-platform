import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  country: text("country").notNull().default("TR"),
  defaultCurrency: text("default_currency").notNull().default("TRY"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const tenantMembers = sqliteTable("tenant_members", {
  tenantId: text("tenant_id").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("Viewer"),
  team: text("team").notNull().default(""),
  title: text("title").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  inviteStatus: text("invite_status").notNull().default("ACTIVE"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.tenantId, table.email] })]);

export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  name: text("name").notNull(),
  manager: text("manager").notNull().default(""),
  area: text("area").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("teams_tenant_name_uq").on(table.tenantId, table.name)]);

export const moduleRecords = sqliteTable("module_records", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  module: text("module").notNull(),
  status: text("status").notNull().default("TASLAK"),
  data: text("data").notNull().default("{}"),
  version: integer("version").notNull().default(1),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdBy: text("created_by").notNull(),
  updatedBy: text("updated_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("module_records_tenant_module_id_uq").on(table.tenantId, table.module, table.id),
  index("module_records_tenant_module_status_idx").on(table.tenantId, table.module, table.status),
]);

export const recordLinks = sqliteTable("record_links", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  fromModule: text("from_module").notNull(),
  fromId: text("from_id").notNull(),
  toModule: text("to_module").notNull(),
  toId: text("to_id").notNull(),
  relation: text("relation").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("record_links_relation_uq").on(table.tenantId, table.fromModule, table.fromId, table.toModule, table.toId, table.relation)]);

export const auditEvents = sqliteTable("audit_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  action: text("action").notNull(),
  module: text("module").notNull(),
  recordId: text("record_id").notNull(),
  payload: text("payload").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_events_tenant_created_idx").on(table.tenantId, table.createdAt)]);

export const supportTickets = sqliteTable("support_tickets", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  requesterEmail: text("requester_email").notNull(),
  module: text("module").notNull(),
  pageArea: text("page_area").notNull(),
  type: text("type").notNull(),
  priority: text("priority").notNull(),
  description: text("description").notNull(),
  reference: text("reference").notNull().default(""),
  status: text("status").notNull().default("OPEN"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const settings = sqliteTable("settings", {
  tenantId: text("tenant_id").notNull(),
  key: text("key").notNull(),
  value: text("value").notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.tenantId, table.key] })]);

export const fileObjects = sqliteTable("file_objects", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  module: text("module").notNull(),
  recordId: text("record_id").notNull(),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  sha256: text("sha256").notNull(),
  scanStatus: text("scan_status").notNull().default("PENDING_RESCAN"),
  scanEngine: text("scan_engine").notNull().default(""),
  scanSummary: text("scan_summary").notNull().default(""),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const legalProfiles = sqliteTable("legal_profiles", {
  tenantId: text("tenant_id").primaryKey(),
  controllerName: text("controller_name").notNull().default(""),
  taxId: text("tax_id").notNull().default(""),
  address: text("address").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  dpoContact: text("dpo_contact").notNull().default(""),
  jurisdictions: text("jurisdictions").notNull().default(""),
  employeeLegalBasis: text("employee_legal_basis").notNull().default(""),
  locationPurposes: text("location_purposes").notNull().default(""),
  retentionDays: integer("retention_days").notNull().default(0),
  periodicDestructionMonths: integer("periodic_destruction_months").notNull().default(0),
  subprocessors: text("subprocessors").notNull().default(""),
  status: text("status").notNull().default("LEGAL_REVIEW_REQUIRED"),
  approvedBy: text("approved_by").notNull().default(""),
  approvedAt: text("approved_at").notNull().default(""),
  legalOpinionReference: text("legal_opinion_reference").notNull().default(""),
  policyVersion: text("policy_version").notNull().default(""),
  updatedBy: text("updated_by").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const migrationRuns = sqliteTable("migration_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  module: text("module").notNull(),
  sourceSha256: text("source_sha256").notNull(),
  status: text("status").notNull().default("COMMITTED"),
  total: integer("total").notNull(),
  imported: integer("imported").notNull(),
  errors: integer("errors").notNull().default(0),
  duplicates: integer("duplicates").notNull().default(0),
  recordIds: text("record_ids").notNull().default("[]"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  rolledBackAt: text("rolled_back_at"),
}, (table) => [index("migration_runs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const monitoringEvents = sqliteTable("monitoring_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  source: text("source").notNull(),
  signal: text("signal").notNull(),
  severity: text("severity").notNull(),
  status: text("status").notNull().default("OPEN"),
  detail: text("detail").notNull().default(""),
  assignedTeam: text("assigned_team").notNull(),
  assignedOwner: text("assigned_owner").notNull().default(""),
  fingerprint: text("fingerprint").notNull().default(""),
  occurrenceCount: integer("occurrence_count").notNull().default(1),
  firstDetectedAt: text("first_detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastDetectedAt: text("last_detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  acknowledgeDueAt: text("acknowledge_due_at"),
  escalationDueAt: text("escalation_due_at"),
  escalationLevel: integer("escalation_level").notNull().default(0),
  runbookUrl: text("runbook_url").notNull().default(""),
  resolutionNote: text("resolution_note").notNull().default(""),
  detectedAt: text("detected_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  acknowledgedAt: text("acknowledged_at"),
  resolvedAt: text("resolved_at"),
}, (table) => [index("monitoring_events_tenant_status_idx").on(table.tenantId, table.status, table.detectedAt)]);

export const operationalHealthSnapshots = sqliteTable("operational_health_snapshots", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  status: text("status").notNull(),
  applicationErrorCount: integer("application_error_count").notNull().default(0),
  staleTelemetryCount: integer("stale_telemetry_count").notNull().default(0),
  failedWebhookCount: integer("failed_webhook_count").notNull().default(0),
  failedCronCount: integer("failed_cron_count").notNull().default(0),
  databaseCapacityPercent: integer("database_capacity_percent").notNull().default(-1),
  storageCapacityPercent: integer("storage_capacity_percent").notNull().default(-1),
  unavailableProviderCount: integer("unavailable_provider_count").notNull().default(0),
  openCriticalCount: integer("open_critical_count").notNull().default(0),
  metricsSource: text("metrics_source").notNull().default("INTERNAL"),
  checkedAt: text("checked_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("operational_health_tenant_time_idx").on(table.tenantId, table.checkedAt)]);

export const monitoringEscalations = sqliteTable("monitoring_escalations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  monitoringEventId: text("monitoring_event_id").notNull(),
  level: integer("level").notNull(),
  fromTeam: text("from_team").notNull(),
  toTeam: text("to_team").notNull(),
  reason: text("reason").notNull(),
  channel: text("channel").notNull().default("IN_APP"),
  deliveryStatus: text("delivery_status").notNull().default("RECORDED"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("monitoring_escalation_event_idx").on(table.tenantId, table.monitoringEventId, table.createdAt)]);

export const restoreRehearsals = sqliteTable("restore_rehearsals", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  backupSha256: text("backup_sha256").notNull(),
  sourceExportedAt: text("source_exported_at").notNull(),
  status: text("status").notNull().default("RUNNING"),
  recordCount: integer("record_count").notNull().default(0),
  fileCount: integer("file_count").notNull().default(0),
  rpoMinutes: integer("rpo_minutes").notNull().default(0),
  rtoSeconds: integer("rto_seconds").notNull().default(0),
  targetNamespace: text("target_namespace").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("restore_rehearsals_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const restoreStagingRecords = sqliteTable("restore_staging_records", {
  rehearsalId: text("rehearsal_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  kind: text("kind").notNull(),
  sourceKey: text("source_key").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
}, (table) => [primaryKey({ columns: [table.rehearsalId, table.kind, table.sourceKey] })]);

export const securityTestRuns = sqliteTable("security_test_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), tool: text("tool").notNull(), scope: text("scope").notNull(),
  status: text("status").notNull(), concurrency: integer("concurrency").notNull().default(0), p95Ms: integer("p95_ms").notNull().default(0),
  p99Ms: integer("p99_ms").notNull().default(0), errorRateBps: integer("error_rate_bps").notNull().default(0), criticalCount: integer("critical_count").notNull().default(0),
  highCount: integer("high_count").notNull().default(0), externalAuditor: text("external_auditor").notNull(), reportFileId: text("report_file_id").notNull(),
  reportSha256: text("report_sha256").notNull(), executedAt: text("executed_at").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("security_test_runs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const securityFindings = sqliteTable("security_findings", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), runId: text("run_id").notNull(), severity: text("severity").notNull(),
  title: text("title").notNull(), status: text("status").notNull().default("OPEN"), owner: text("owner").notNull(), remediation: text("remediation").notNull().default(""),
  dueDate: text("due_date").notNull().default(""), verifiedAt: text("verified_at"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("security_findings_tenant_status_idx").on(table.tenantId, table.status, table.severity)]);

export const pilotRuns = sqliteTable("pilot_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), name: text("name").notNull(), status: text("status").notNull(),
  companyCount: integer("company_count").notNull(), vehicleCount: integer("vehicle_count").notNull(), customerApprover: text("customer_approver").notNull(),
  platformApprover: text("platform_approver").notNull(), customerApprovedAt: text("customer_approved_at"), platformApprovedAt: text("platform_approved_at"),
  evidenceFileId: text("evidence_file_id").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("pilot_runs_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const pilotScenarios = sqliteTable("pilot_scenarios", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), pilotRunId: text("pilot_run_id").notNull(), code: text("code").notNull(),
  expectedResult: text("expected_result").notNull(), actualResult: text("actual_result").notNull(), status: text("status").notNull(), blockerSeverity: text("blocker_severity").notNull().default("NONE"),
  executedAt: text("executed_at").notNull(),
}, (table) => [uniqueIndex("pilot_scenario_run_code_uq").on(table.pilotRunId, table.code)]);

export const mobileReleases = sqliteTable("mobile_releases", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), platform: text("platform").notNull(), version: text("version").notNull(),
  buildNumber: text("build_number").notNull(), bundleId: text("bundle_id").notNull(), storeStatus: text("store_status").notNull(), storeReviewId: text("store_review_id").notNull(),
  signingStatus: text("signing_status").notNull(), backgroundLocationStatus: text("background_location_status").notNull(), dataSafetyStatus: text("data_safety_status").notNull(),
  privacyUrl: text("privacy_url").notNull(), supportUrl: text("support_url").notNull(), accountDeletionUrl: text("account_deletion_url").notNull(), rollbackPlan: text("rollback_plan").notNull(),
  evidenceFileId: text("evidence_file_id").notNull(), evidenceSha256: text("evidence_sha256").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("mobile_releases_tenant_platform_status_idx").on(table.tenantId, table.platform, table.storeStatus, table.createdAt)]);

export const fieldValidationRuns = sqliteTable("field_validation_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), kind: text("kind").notNull(), deviceId: text("device_id").notNull(),
  platform: text("platform").notNull().default(""), manufacturer: text("manufacturer").notNull().default(""), model: text("model").notNull().default(""),
  osVersion: text("os_version").notNull().default(""), provider: text("provider").notNull().default(""), protocol: text("protocol").notNull().default(""),
  scenario: text("scenario").notNull(), expectedOutcome: text("expected_outcome").notNull(), observedOutcome: text("observed_outcome").notNull(),
  startedAt: text("started_at").notNull(), endedAt: text("ended_at").notNull(), durationMinutes: integer("duration_minutes").notNull(),
  telemetryCount: integer("telemetry_count").notNull().default(0), gatewayEventCount: integer("gateway_event_count").notNull().default(0),
  maxGapSeconds: integer("max_gap_seconds").notNull().default(0), batteryDropPercent: integer("battery_drop_percent").notNull().default(0),
  crashCount: integer("crash_count").notNull().default(0), permissionLossCount: integer("permission_loss_count").notNull().default(0),
  runtimeEventCount: integer("runtime_event_count").notNull().default(0), offlineQueueCount: integer("offline_queue_count").notNull().default(0),
  flushedCount: integer("flushed_count").notNull().default(0), lateTelemetryCount: integer("late_telemetry_count").notNull().default(0),
  batterySampleCount: integer("battery_sample_count").notNull().default(0),
  status: text("status").notNull(), evidenceFileId: text("evidence_file_id").notNull(), evidenceSha256: text("evidence_sha256").notNull(),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("field_validation_tenant_kind_status_idx").on(table.tenantId, table.kind, table.status, table.createdAt)]);

export const mobileRuntimeEvents = sqliteTable("mobile_runtime_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), deviceId: text("device_id").notNull(), sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(), sequence: integer("sequence").notNull(), batteryPercent: integer("battery_percent").notNull().default(-1),
  queueDepth: integer("queue_depth").notNull().default(0), networkType: text("network_type").notNull().default("UNKNOWN"), appState: text("app_state").notNull().default("UNKNOWN"),
  details: text("details").notNull().default("{}"), occurredAt: text("occurred_at").notNull(), receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("mobile_runtime_event_dedupe_uq").on(table.tenantId, table.deviceId, table.id), index("mobile_runtime_session_time_idx").on(table.tenantId, table.sessionId, table.occurredAt), index("mobile_runtime_type_time_idx").on(table.tenantId, table.eventType, table.occurredAt)]);

export const dataAcceptanceRuns = sqliteTable("data_acceptance_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), migrationRunId: text("migration_run_id").notNull(), rollbackRunId: text("rollback_run_id").notNull(),
  module: text("module").notNull(), sourceSha256: text("source_sha256").notNull(), sourceTotal: integer("source_total").notNull(), imported: integer("imported").notNull(),
  errors: integer("errors").notNull().default(0), duplicates: integer("duplicates").notNull().default(0), persistedCount: integer("persisted_count").notNull().default(0),
  sampleSize: integer("sample_size").notNull().default(0), reconciliationStatus: text("reconciliation_status").notNull(), status: text("status").notNull(),
  customerApprover: text("customer_approver").notNull(), evidenceFileId: text("evidence_file_id").notNull(), evidenceSha256: text("evidence_sha256").notNull(),
  executedAt: text("executed_at").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("data_acceptance_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const productionRollouts = sqliteTable("production_rollouts", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), phase: text("phase").notNull(), targetPercent: integer("target_percent").notNull(),
  status: text("status").notNull(), startedAt: text("started_at").notNull(), endedAt: text("ended_at").notNull(), durationMinutes: integer("duration_minutes").notNull(),
  readinessPassed: integer("readiness_passed").notNull().default(0), readinessTotal: integer("readiness_total").notNull().default(0), connectedProviders: integer("connected_providers").notNull().default(0),
  providerTotal: integer("provider_total").notNull().default(0), criticalIncidentCount: integer("critical_incident_count").notNull().default(0),
  pendingOutboxCount: integer("pending_outbox_count").notNull().default(0), staleTelemetryCount: integer("stale_telemetry_count").notNull().default(0),
  ownerApprover: text("owner_approver").notNull(), operationsApprover: text("operations_approver").notNull(), rollbackPlan: text("rollback_plan").notNull(),
  rollbackTriggered: integer("rollback_triggered").notNull().default(0), evidenceFileId: text("evidence_file_id").notNull(), evidenceSha256: text("evidence_sha256").notNull(),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("production_rollout_tenant_phase_status_idx").on(table.tenantId, table.phase, table.status, table.createdAt)]);

export const e2eAcceptanceRuns = sqliteTable("e2e_acceptance_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), environment: text("environment").notNull(), baseUrl: text("base_url").notNull(),
  runner: text("runner").notNull(), browser: text("browser").notNull(), apiTotal: integer("api_total").notNull(), apiPassed: integer("api_passed").notNull(),
  roleTotal: integer("role_total").notNull(), rolePassed: integer("role_passed").notNull(), tenantTotal: integer("tenant_total").notNull(), tenantPassed: integer("tenant_passed").notNull(),
  browserTotal: integer("browser_total").notNull(), browserPassed: integer("browser_passed").notNull(), failedCount: integer("failed_count").notNull().default(0),
  status: text("status").notNull(), commitSha: text("commit_sha").notNull(), evidenceFileId: text("evidence_file_id").notNull(), evidenceSha256: text("evidence_sha256").notNull(),
  executedAt: text("executed_at").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("e2e_acceptance_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const vehicleCatalogVersions = sqliteTable("vehicle_catalog_versions", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), version: text("version").notNull(), source: text("source").notNull(),
  market: text("market").notNull(), status: text("status").notNull().default("ACTIVE"), entryCount: integer("entry_count").notNull().default(0),
  sourceSha256: text("source_sha256").notNull(), publishedBy: text("published_by").notNull(), publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("vehicle_catalog_tenant_version_uq").on(table.tenantId, table.version)]);

export const vehicleCatalogEntries = sqliteTable("vehicle_catalog_entries", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), versionId: text("version_id").notNull(), make: text("make").notNull(), model: text("model").notNull(),
  yearFrom: integer("year_from").notNull(), yearTo: integer("year_to").notNull(), market: text("market").notNull(), bodyType: text("body_type").notNull().default(""),
  fuelType: text("fuel_type").notNull().default(""), externalCode: text("external_code").notNull().default(""), active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [uniqueIndex("vehicle_catalog_entry_uq").on(table.tenantId, table.versionId, table.make, table.model, table.market, table.yearFrom)]);

export const vinDecodeEvents = sqliteTable("vin_decode_events", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), vin: text("vin").notNull(), provider: text("provider").notNull(), status: text("status").notNull(),
  make: text("make").notNull().default(""), model: text("model").notNull().default(""), modelYear: integer("model_year").notNull().default(0), market: text("market").notNull().default(""),
  responseDigest: text("response_digest").notNull(), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("vin_decode_tenant_vin_idx").on(table.tenantId, table.vin, table.createdAt)]);

export const operationsControls = sqliteTable("operations_controls", {
  id: text("id").notNull(), tenantId: text("tenant_id").notNull(), kind: text("kind").notNull(), name: text("name").notNull(), ownerTeam: text("owner_team").notNull(),
  schedule: text("schedule").notNull(), targetMinutes: integer("target_minutes").notNull(), escalationMinutes: integer("escalation_minutes").notNull(),
  retentionDays: integer("retention_days").notNull().default(0), runbookUrl: text("runbook_url").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true),
  updatedBy: text("updated_by").notNull(), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.tenantId, table.id] }), index("operations_control_tenant_kind_idx").on(table.tenantId, table.kind)]);

export const operationsReadinessRuns = sqliteTable("operations_readiness_runs", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), status: text("status").notNull(), activeControls: integer("active_controls").notNull(), requiredControls: integer("required_controls").notNull(),
  openCriticalAlerts: integer("open_critical_alerts").notNull(), restoreAgeDays: integer("restore_age_days").notNull(), onCallOwner: text("on_call_owner").notNull(),
  evidenceFileId: text("evidence_file_id").notNull(), evidenceSha256: text("evidence_sha256").notNull(), executedAt: text("executed_at").notNull(),
  createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("operations_readiness_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const rateLimitWindows = sqliteTable("rate_limit_windows", {
  scope: text("scope").notNull(),
  keyHash: text("key_hash").notNull(),
  windowStart: integer("window_start").notNull(),
  hits: integer("hits").notNull().default(1),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  primaryKey({ columns: [table.scope, table.keyHash, table.windowStart] }),
  index("rate_limit_window_idx").on(table.windowStart),
]);

export const outboxEvents = sqliteTable("outbox_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  topic: text("topic").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  processedAt: text("processed_at"),
  lastError: text("last_error").notNull().default(""),
}, (table) => [index("outbox_tenant_status_idx").on(table.tenantId, table.status, table.createdAt)]);

export const telemetryEvents = sqliteTable("telemetry_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  vehicleId: text("vehicle_id").notNull(),
  deviceId: text("device_id").notNull(),
  latitude: text("latitude").notNull(),
  longitude: text("longitude").notNull(),
  speed: integer("speed").notNull().default(0),
  battery: integer("battery").notNull().default(0),
  source: text("source").notNull().default("BROWSER"),
  provider: text("provider").notNull().default("FILO"),
  eventType: text("event_type").notNull().default("LOCATION"),
  sequence: integer("sequence").notNull().default(0),
  accuracy: integer("accuracy").notNull().default(0),
  altitude: integer("altitude").notNull().default(0),
  heading: integer("heading").notNull().default(0),
  sessionId: text("session_id").notNull().default(""),
  capturedAt: text("captured_at").notNull(),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("telemetry_dedupe_uq").on(table.tenantId, table.deviceId, table.capturedAt),
  index("telemetry_vehicle_time_idx").on(table.tenantId, table.vehicleId, table.capturedAt),
]);

export const consentEvents = sqliteTable("consent_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  actorEmail: text("actor_email").notNull(),
  documentKey: text("document_key").notNull(),
  documentVersion: text("document_version").notNull(),
  locale: text("locale").notNull().default("tr-TR"),
  evidence: text("evidence").notNull().default("{}"),
  acceptedAt: text("accepted_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("consent_actor_document_uq").on(table.tenantId, table.actorEmail, table.documentKey, table.documentVersion)]);

export const providerConnections = sqliteTable("provider_connections", {
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("CONFIG_REQUIRED"),
  lastCheckAt: text("last_check_at"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [primaryKey({ columns: [table.tenantId, table.provider] })]);

export const providerCallbackEvents = sqliteTable("provider_callback_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),
  externalEventId: text("external_event_id").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  status: text("status").notNull().default("RECEIVED"),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("provider_callback_event_uq").on(table.provider, table.externalEventId),
  index("provider_callback_tenant_received_idx").on(table.tenantId, table.receivedAt),
]);

export const signatureRequests = sqliteTable("signature_requests", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  custodyRecordId: text("custody_record_id").notNull(),
  method: text("method").notNull(),
  provider: text("provider").notNull().default("MANUAL"),
  status: text("status").notNull().default("DRAFT"),
  documentDigest: text("document_digest").notNull().default(""),
  evidenceFileId: text("evidence_file_id").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("signature_custody_uq").on(table.tenantId, table.custodyRecordId)]);

export const subscriptionOrders = sqliteTable("subscription_orders", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  plan: text("plan").notNull(),
  period: text("period").notNull(),
  seats: integer("seats").notNull(),
  vehicles: integer("vehicles").notNull(),
  amountMinor: integer("amount_minor").notNull(),
  currency: text("currency").notNull(),
  status: text("status").notNull().default("PAYMENT_PROVIDER_REQUIRED"),
  providerReference: text("provider_reference").notNull().default(""),
  checkoutUrl: text("checkout_url").notNull().default(""),
  idempotencyKey: text("idempotency_key").notNull().default(""),
  failureCode: text("failure_code").notNull().default(""),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("subscription_orders_tenant_status_idx").on(table.tenantId, table.status)]);

export const deviceIngestTokens = sqliteTable("device_ingest_tokens", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  deviceId: text("device_id").notNull(),
  tokenHash: text("token_hash").notNull(),
  provider: text("provider").notNull().default("MOBILE"),
  protocol: text("protocol").notNull().default("HTTPS_JSON_V1"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("device_ingest_token_hash_uq").on(table.tokenHash),
  index("device_ingest_tenant_device_idx").on(table.tenantId, table.deviceId),
]);

export const hardwareSimCards = sqliteTable("hardware_sim_cards", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), iccid: text("iccid").notNull(), msisdn: text("msisdn").notNull().default(""),
  operator: text("operator").notNull().default(""), apn: text("apn").notNull().default(""), status: text("status").notNull().default("STOCK"),
  activatedAt: text("activated_at"), suspendedAt: text("suspended_at"), createdBy: text("created_by").notNull(), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("hardware_sim_tenant_iccid_uq").on(table.tenantId, table.iccid), index("hardware_sim_tenant_status_idx").on(table.tenantId, table.status)]);

export const hardwareDeviceAssignments = sqliteTable("hardware_device_assignments", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), deviceId: text("device_id").notNull(), vehicleId: text("vehicle_id").notNull(),
  imei: text("imei").notNull(), iccid: text("iccid").notNull(), provider: text("provider").notNull(), modelCode: text("model_code").notNull(), protocol: text("protocol").notNull(),
  transport: text("transport").notNull().default("TCP_MQTT_HTTPS"), status: text("status").notNull().default("PROVISIONED"), firmwareVersion: text("firmware_version").notNull().default(""),
  assignedBy: text("assigned_by").notNull(), assignedAt: text("assigned_at").notNull().default(sql`CURRENT_TIMESTAMP`), revokedAt: text("revoked_at"),
  lastGatewayAt: text("last_gateway_at"), updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("hardware_assignment_tenant_imei_uq").on(table.tenantId, table.imei), uniqueIndex("hardware_assignment_tenant_device_uq").on(table.tenantId, table.deviceId), index("hardware_assignment_tenant_vehicle_status_idx").on(table.tenantId, table.vehicleId, table.status), index("hardware_assignment_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt)]);

export const mobileInstallations = sqliteTable("mobile_installations", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  deviceId: text("device_id").notNull(),
  driverId: text("driver_id").notNull(),
  platform: text("platform").notNull(),
  osVersion: text("os_version").notNull(),
  appVersion: text("app_version").notNull(),
  deviceModel: text("device_model").notNull().default(""),
  foregroundPermission: text("foreground_permission").notNull().default("UNKNOWN"),
  backgroundPermission: text("background_permission").notNull().default("UNKNOWN"),
  foregroundService: text("foreground_service").notNull().default("NOT_APPLICABLE"),
  batteryOptimization: text("battery_optimization").notNull().default("UNKNOWN"),
  notificationPermission: text("notification_permission").notNull().default("UNKNOWN"),
  pushToken: text("push_token").notNull().default(""),
  pushTokenStatus: text("push_token_status").notNull().default("UNREGISTERED"),
  status: text("status").notNull().default("REGISTERED"),
  lastHeartbeatAt: text("last_heartbeat_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("mobile_installation_device_uq").on(table.tenantId, table.deviceId),
  index("mobile_installation_tenant_status_idx").on(table.tenantId, table.status),
]);

export const trackingSessions = sqliteTable("tracking_sessions", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  deviceId: text("device_id").notNull(),
  vehicleId: text("vehicle_id").notNull(),
  driverId: text("driver_id").notNull(),
  source: text("source").notNull(),
  provider: text("provider").notNull(),
  status: text("status").notNull().default("ACTIVE"),
  permissionSnapshot: text("permission_snapshot").notNull().default("{}"),
  startedAt: text("started_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at"),
  endedAt: text("ended_at"),
}, (table) => [
  index("tracking_session_tenant_status_idx").on(table.tenantId, table.status, table.startedAt),
  index("tracking_session_device_status_idx").on(table.tenantId, table.deviceId, table.status),
]);

export const trackerGatewayEvents = sqliteTable("tracker_gateway_events", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  deviceId: text("device_id").notNull(),
  provider: text("provider").notNull(),
  protocol: text("protocol").notNull(),
  externalMessageId: text("external_message_id").notNull(),
  payloadSha256: text("payload_sha256").notNull(),
  recordCount: integer("record_count").notNull().default(0),
  status: text("status").notNull().default("RECEIVED"),
  receivedAt: text("received_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("tracker_gateway_message_uq").on(table.tenantId, table.deviceId, table.externalMessageId),
  index("tracker_gateway_tenant_received_idx").on(table.tenantId, table.receivedAt),
]);

export const providerDispatches = sqliteTable("provider_dispatches", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  recordId: text("record_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestSha256: text("request_sha256").notNull(),
  status: text("status").notNull().default("PENDING"),
  attempts: integer("attempts").notNull().default(0),
  providerReference: text("provider_reference").notNull().default(""),
  responseCode: integer("response_code").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  lastError: text("last_error").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("provider_dispatch_idempotency_uq").on(table.tenantId, table.provider, table.idempotencyKey),
  index("provider_dispatch_status_idx").on(table.tenantId, table.provider, table.status, table.nextAttemptAt),
]);

export const eDocuments = sqliteTable("e_documents", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  sourceModule: text("source_module").notNull(),
  sourceRecordId: text("source_record_id").notNull(),
  documentType: text("document_type").notNull(),
  currency: text("currency").notNull(),
  netMinor: integer("net_minor").notNull(),
  taxMinor: integer("tax_minor").notNull(),
  grossMinor: integer("gross_minor").notNull(),
  status: text("status").notNull().default("DRAFT"),
  providerReference: text("provider_reference").notNull().default(""),
  failureCode: text("failure_code").notNull().default(""),
  issuedAt: text("issued_at"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("e_document_source_uq").on(table.tenantId, table.sourceModule, table.sourceRecordId),
  index("e_document_status_idx").on(table.tenantId, table.status, table.updatedAt),
]);

export const notificationDeliveries = sqliteTable("notification_deliveries", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  outboxEventId: text("outbox_event_id").notNull(),
  channel: text("channel").notNull(),
  recipient: text("recipient").notNull(),
  templateKey: text("template_key").notNull(),
  status: text("status").notNull().default("PENDING"),
  providerReference: text("provider_reference").notNull().default(""),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: text("next_attempt_at"),
  lastError: text("last_error").notNull().default(""),
  sentAt: text("sent_at"),
  deliveredAt: text("delivered_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("notification_delivery_target_uq").on(table.tenantId, table.outboxEventId, table.channel, table.recipient),
  index("notification_delivery_status_idx").on(table.tenantId, table.status, table.nextAttemptAt),
]);

export const scheduledJobRuns = sqliteTable("scheduled_job_runs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  jobName: text("job_name").notNull(),
  slot: text("slot").notNull(),
  status: text("status").notNull().default("PENDING"),
  attempt: integer("attempt").notNull().default(0),
  startedAt: text("started_at"),
  completedAt: text("completed_at"),
  result: text("result").notNull().default("{}"),
  lastError: text("last_error").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("scheduled_job_tenant_slot_uq").on(table.tenantId, table.jobName, table.slot),
  index("scheduled_job_status_idx").on(table.status, table.updatedAt),
]);

export const taxProfileVersions = sqliteTable("tax_profile_versions", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), version: text("version").notNull(), source: text("source").notNull(),
  status: text("status").notNull().default("ACTIVE"), entryCount: integer("entry_count").notNull().default(0), sourceSha256: text("source_sha256").notNull(),
  publishedBy: text("published_by").notNull(), publishedAt: text("published_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("tax_profile_tenant_version_uq").on(table.tenantId, table.version)]);

export const taxProfileEntries = sqliteTable("tax_profile_entries", {
  id: text("id").primaryKey(), tenantId: text("tenant_id").notNull(), versionId: text("version_id").notNull(), countryCode: text("country_code").notNull(),
  regionCode: text("region_code").notNull().default(""), label: text("label").notNull(), currency: text("currency").notNull(), taxName: text("tax_name").notNull(),
  rateBps: integer("rate_bps").notNull(), category: text("category").notNull(), documentTypes: text("document_types").notNull().default("[]"),
  reverseCharge: integer("reverse_charge", { mode: "boolean" }).notNull().default(false), effectiveFrom: text("effective_from").notNull(), effectiveTo: text("effective_to"),
  sourceUrl: text("source_url").notNull(), active: integer("active", { mode: "boolean" }).notNull().default(true),
}, (table) => [
  uniqueIndex("tax_profile_entry_label_uq").on(table.tenantId, table.versionId, table.label),
  index("tax_profile_lookup_idx").on(table.tenantId, table.countryCode, table.regionCode, table.active, table.effectiveFrom),
]);
