-- Generated from immutable D1 migrations. Do not hand-edit.
-- Target: Supabase PostgreSQL + PostGIS + tenant RLS
BEGIN;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;
CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"module" text NOT NULL,
	"record_id" text NOT NULL,
	"payload" text DEFAULT '{}' NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "file_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"module" text NOT NULL,
	"record_id" text NOT NULL,
	"object_key" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "file_objects_object_key_unique" ON "file_objects" ("object_key");
CREATE TABLE "module_records" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"module" text NOT NULL,
	"status" text DEFAULT 'TASLAK' NOT NULL,
	"data" text DEFAULT '{}' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived" integer DEFAULT 0 NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "module_records_tenant_module_id_uq" ON "module_records" ("tenant_id","module","id");
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"topic" text NOT NULL,
	"payload" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"processed_at" timestamptz
);

CREATE TABLE "record_links" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"from_module" text NOT NULL,
	"from_id" text NOT NULL,
	"to_module" text NOT NULL,
	"to_id" text NOT NULL,
	"relation" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "settings" (
	"tenant_id" text NOT NULL,
	"key" text NOT NULL,
	"value" text NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY("tenant_id", "key")
);

CREATE TABLE "support_tickets" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"requester_email" text NOT NULL,
	"module" text NOT NULL,
	"page_area" text NOT NULL,
	"type" text NOT NULL,
	"priority" text NOT NULL,
	"description" text NOT NULL,
	"reference" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "teams" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"manager" text DEFAULT '' NOT NULL,
	"area" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "teams_tenant_name_uq" ON "teams" ("tenant_id","name");
CREATE TABLE "telemetry_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"device_id" text NOT NULL,
	"latitude" text NOT NULL,
	"longitude" text NOT NULL,
	"speed" integer DEFAULT 0 NOT NULL,
	"battery" integer DEFAULT 0 NOT NULL,
	"captured_at" timestamptz NOT NULL,
	"received_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "tenant_members" (
	"tenant_id" text NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'Viewer' NOT NULL,
	"team" text DEFAULT '' NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"invite_status" text DEFAULT 'ACTIVE' NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY("tenant_id", "email")
);

CREATE TABLE "tenants" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"country" text DEFAULT 'TR' NOT NULL,
	"default_currency" text DEFAULT 'TRY' NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "consent_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"actor_email" text NOT NULL,
	"document_key" text NOT NULL,
	"document_version" text NOT NULL,
	"locale" text DEFAULT 'tr-TR' NOT NULL,
	"evidence" text DEFAULT '{}' NOT NULL,
	"accepted_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "consent_actor_document_uq" ON "consent_events" ("tenant_id","actor_email","document_key","document_version");
CREATE TABLE "device_ingest_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamptz NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "device_ingest_token_hash_uq" ON "device_ingest_tokens" ("token_hash");
CREATE INDEX "device_ingest_tenant_device_idx" ON "device_ingest_tokens" ("tenant_id","device_id");
CREATE TABLE "provider_connections" (
	"tenant_id" text NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'CONFIG_REQUIRED' NOT NULL,
	"last_check_at" timestamptz,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY("tenant_id", "provider")
);

CREATE TABLE "signature_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"custody_record_id" text NOT NULL,
	"method" text NOT NULL,
	"provider" text DEFAULT 'MANUAL' NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"document_digest" text DEFAULT '' NOT NULL,
	"evidence_file_id" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "signature_custody_uq" ON "signature_requests" ("tenant_id","custody_record_id");
CREATE TABLE "subscription_orders" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"plan" text NOT NULL,
	"period" text NOT NULL,
	"seats" integer NOT NULL,
	"vehicles" integer NOT NULL,
	"amount_minor" integer NOT NULL,
	"currency" text NOT NULL,
	"status" text DEFAULT 'PAYMENT_PROVIDER_REQUIRED' NOT NULL,
	"provider_reference" text DEFAULT '' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "subscription_orders_tenant_status_idx" ON "subscription_orders" ("tenant_id","status");
ALTER TABLE "outbox_events" ADD "last_error" text DEFAULT '' NOT NULL;
CREATE INDEX "outbox_tenant_status_idx" ON "outbox_events" ("tenant_id","status","created_at");
CREATE INDEX "audit_events_tenant_created_idx" ON "audit_events" ("tenant_id","created_at");
CREATE INDEX "module_records_tenant_module_status_idx" ON "module_records" ("tenant_id","module","status");
CREATE UNIQUE INDEX "record_links_relation_uq" ON "record_links" ("tenant_id","from_module","from_id","to_module","to_id","relation");
CREATE UNIQUE INDEX "telemetry_dedupe_uq" ON "telemetry_events" ("tenant_id","device_id","captured_at");
CREATE INDEX "telemetry_vehicle_time_idx" ON "telemetry_events" ("tenant_id","vehicle_id","captured_at");
CREATE TABLE "provider_callback_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" text NOT NULL,
	"external_event_id" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "provider_callback_event_uq" ON "provider_callback_events" ("provider","external_event_id");
CREATE INDEX "provider_callback_tenant_received_idx" ON "provider_callback_events" ("tenant_id","received_at");
CREATE TABLE "legal_profiles" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"controller_name" text DEFAULT '' NOT NULL,
	"tax_id" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"contact_email" text DEFAULT '' NOT NULL,
	"dpo_contact" text DEFAULT '' NOT NULL,
	"jurisdictions" text DEFAULT '' NOT NULL,
	"employee_legal_basis" text DEFAULT '' NOT NULL,
	"location_purposes" text DEFAULT '' NOT NULL,
	"retention_days" integer DEFAULT 0 NOT NULL,
	"periodic_destruction_months" integer DEFAULT 0 NOT NULL,
	"subprocessors" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'LEGAL_REVIEW_REQUIRED' NOT NULL,
	"approved_by" text DEFAULT '' NOT NULL,
	"approved_at" text DEFAULT '' NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE "rate_limit_windows" (
	"scope" text NOT NULL,
	"key_hash" text NOT NULL,
	"window_start" integer NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY("scope", "key_hash", "window_start")
);

CREATE INDEX "rate_limit_window_idx" ON "rate_limit_windows" ("window_start");
ALTER TABLE "file_objects" ADD "scan_status" text DEFAULT 'PENDING_RESCAN' NOT NULL;
ALTER TABLE "file_objects" ADD "scan_engine" text DEFAULT '' NOT NULL;
ALTER TABLE "file_objects" ADD "scan_summary" text DEFAULT '' NOT NULL;

CREATE OR REPLACE FUNCTION public.block_audit_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	RAISE EXCEPTION 'audit_events are append-only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER "audit_events_block_update" BEFORE UPDATE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION public.block_audit_event_mutation();

CREATE TRIGGER "audit_events_block_delete" BEFORE DELETE ON "audit_events"
FOR EACH ROW EXECUTE FUNCTION public.block_audit_event_mutation();

CREATE TABLE "mobile_installations" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"platform" text NOT NULL,
	"os_version" text NOT NULL,
	"app_version" text NOT NULL,
	"device_model" text DEFAULT '' NOT NULL,
	"foreground_permission" text DEFAULT 'UNKNOWN' NOT NULL,
	"background_permission" text DEFAULT 'UNKNOWN' NOT NULL,
	"foreground_service" text DEFAULT 'NOT_APPLICABLE' NOT NULL,
	"battery_optimization" text DEFAULT 'UNKNOWN' NOT NULL,
	"notification_permission" text DEFAULT 'UNKNOWN' NOT NULL,
	"status" text DEFAULT 'REGISTERED' NOT NULL,
	"last_heartbeat_at" timestamptz,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "mobile_installation_device_uq" ON "mobile_installations" ("tenant_id","device_id");
CREATE INDEX "mobile_installation_tenant_status_idx" ON "mobile_installations" ("tenant_id","status");
CREATE TABLE "tracker_gateway_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"provider" text NOT NULL,
	"protocol" text NOT NULL,
	"external_message_id" text NOT NULL,
	"payload_sha256" text NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"received_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "tracker_gateway_message_uq" ON "tracker_gateway_events" ("tenant_id","device_id","external_message_id");
CREATE INDEX "tracker_gateway_tenant_received_idx" ON "tracker_gateway_events" ("tenant_id","received_at");
CREATE TABLE "tracking_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"device_id" text NOT NULL,
	"vehicle_id" text NOT NULL,
	"driver_id" text NOT NULL,
	"source" text NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"permission_snapshot" text DEFAULT '{}' NOT NULL,
	"started_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"last_seen_at" timestamptz,
	"ended_at" timestamptz
);

CREATE INDEX "tracking_session_tenant_status_idx" ON "tracking_sessions" ("tenant_id","status","started_at");
CREATE INDEX "tracking_session_device_status_idx" ON "tracking_sessions" ("tenant_id","device_id","status");
ALTER TABLE "device_ingest_tokens" ADD "provider" text DEFAULT 'MOBILE' NOT NULL;
ALTER TABLE "device_ingest_tokens" ADD "protocol" text DEFAULT 'HTTPS_JSON_V1' NOT NULL;
ALTER TABLE "telemetry_events" ADD "source" text DEFAULT 'BROWSER' NOT NULL;
ALTER TABLE "telemetry_events" ADD "provider" text DEFAULT 'FILO' NOT NULL;
ALTER TABLE "telemetry_events" ADD "event_type" text DEFAULT 'LOCATION' NOT NULL;
ALTER TABLE "telemetry_events" ADD "sequence" integer DEFAULT 0 NOT NULL;
ALTER TABLE "telemetry_events" ADD "accuracy" integer DEFAULT 0 NOT NULL;
ALTER TABLE "telemetry_events" ADD "altitude" integer DEFAULT 0 NOT NULL;
ALTER TABLE "telemetry_events" ADD "heading" integer DEFAULT 0 NOT NULL;
ALTER TABLE "telemetry_events" ADD "session_id" text DEFAULT '' NOT NULL;
CREATE TABLE "e_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source_module" text NOT NULL,
	"source_record_id" text NOT NULL,
	"document_type" text NOT NULL,
	"currency" text NOT NULL,
	"net_minor" integer NOT NULL,
	"tax_minor" integer NOT NULL,
	"gross_minor" integer NOT NULL,
	"status" text DEFAULT 'DRAFT' NOT NULL,
	"provider_reference" text DEFAULT '' NOT NULL,
	"failure_code" text DEFAULT '' NOT NULL,
	"issued_at" timestamptz,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "e_document_source_uq" ON "e_documents" ("tenant_id","source_module","source_record_id");
CREATE INDEX "e_document_status_idx" ON "e_documents" ("tenant_id","status","updated_at");
CREATE TABLE "notification_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"outbox_event_id" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"template_key" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"provider_reference" text DEFAULT '' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamptz,
	"last_error" text DEFAULT '' NOT NULL,
	"sent_at" timestamptz,
	"delivered_at" timestamptz,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "notification_delivery_target_uq" ON "notification_deliveries" ("tenant_id","outbox_event_id","channel","recipient");
CREATE INDEX "notification_delivery_status_idx" ON "notification_deliveries" ("tenant_id","status","next_attempt_at");
CREATE TABLE "provider_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"provider" text NOT NULL,
	"kind" text NOT NULL,
	"record_id" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_sha256" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"provider_reference" text DEFAULT '' NOT NULL,
	"response_code" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamptz,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "provider_dispatch_idempotency_uq" ON "provider_dispatches" ("tenant_id","provider","idempotency_key");
CREATE INDEX "provider_dispatch_status_idx" ON "provider_dispatches" ("tenant_id","provider","status","next_attempt_at");
ALTER TABLE "mobile_installations" ADD "push_token" text DEFAULT '' NOT NULL;
ALTER TABLE "mobile_installations" ADD "push_token_status" text DEFAULT 'UNREGISTERED' NOT NULL;
ALTER TABLE "subscription_orders" ADD "checkout_url" text DEFAULT '' NOT NULL;
ALTER TABLE "subscription_orders" ADD "idempotency_key" text DEFAULT '' NOT NULL;
ALTER TABLE "subscription_orders" ADD "failure_code" text DEFAULT '' NOT NULL;
CREATE TABLE "migration_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"module" text NOT NULL,
	"source_sha256" text NOT NULL,
	"status" text DEFAULT 'COMMITTED' NOT NULL,
	"total" integer NOT NULL,
	"imported" integer NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"record_ids" text DEFAULT '[]' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"rolled_back_at" timestamptz
);

CREATE INDEX "migration_runs_tenant_status_idx" ON "migration_runs" ("tenant_id","status","created_at");
CREATE TABLE "monitoring_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"source" text NOT NULL,
	"signal" text NOT NULL,
	"severity" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"assigned_team" text NOT NULL,
	"detected_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"acknowledged_at" timestamptz,
	"resolved_at" timestamptz
);

CREATE INDEX "monitoring_events_tenant_status_idx" ON "monitoring_events" ("tenant_id","status","detected_at");
CREATE TABLE "restore_rehearsals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"backup_sha256" text NOT NULL,
	"source_exported_at" timestamptz NOT NULL,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"record_count" integer DEFAULT 0 NOT NULL,
	"file_count" integer DEFAULT 0 NOT NULL,
	"rpo_minutes" integer DEFAULT 0 NOT NULL,
	"rto_seconds" integer DEFAULT 0 NOT NULL,
	"target_namespace" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "restore_rehearsals_tenant_status_idx" ON "restore_rehearsals" ("tenant_id","status","created_at");
CREATE TABLE "restore_staging_records" (
	"rehearsal_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"source_key" text NOT NULL,
	"payload_sha256" text NOT NULL,
	PRIMARY KEY("rehearsal_id", "kind", "source_key")
);

ALTER TABLE "legal_profiles" ADD "legal_opinion_reference" text DEFAULT '' NOT NULL;
ALTER TABLE "legal_profiles" ADD "policy_version" text DEFAULT '' NOT NULL;
CREATE TABLE "mobile_releases" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"platform" text NOT NULL,
	"version" text NOT NULL,
	"build_number" text NOT NULL,
	"bundle_id" text NOT NULL,
	"store_status" text NOT NULL,
	"store_review_id" text NOT NULL,
	"signing_status" text NOT NULL,
	"background_location_status" text NOT NULL,
	"data_safety_status" text NOT NULL,
	"privacy_url" text NOT NULL,
	"support_url" text NOT NULL,
	"account_deletion_url" text NOT NULL,
	"rollback_plan" text NOT NULL,
	"evidence_file_id" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "mobile_releases_tenant_platform_status_idx" ON "mobile_releases" ("tenant_id","platform","store_status","created_at");
CREATE TABLE "pilot_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"company_count" integer NOT NULL,
	"vehicle_count" integer NOT NULL,
	"customer_approver" text NOT NULL,
	"platform_approver" text NOT NULL,
	"customer_approved_at" timestamptz,
	"platform_approved_at" timestamptz,
	"evidence_file_id" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "pilot_runs_tenant_status_idx" ON "pilot_runs" ("tenant_id","status","created_at");
CREATE TABLE "pilot_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"pilot_run_id" text NOT NULL,
	"code" text NOT NULL,
	"expected_result" text NOT NULL,
	"actual_result" text NOT NULL,
	"status" text NOT NULL,
	"blocker_severity" text DEFAULT 'NONE' NOT NULL,
	"executed_at" timestamptz NOT NULL
);

CREATE UNIQUE INDEX "pilot_scenario_run_code_uq" ON "pilot_scenarios" ("pilot_run_id","code");
CREATE TABLE "security_findings" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"run_id" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"owner" text NOT NULL,
	"remediation" text DEFAULT '' NOT NULL,
	"due_date" text DEFAULT '' NOT NULL,
	"verified_at" timestamptz,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "security_findings_tenant_status_idx" ON "security_findings" ("tenant_id","status","severity");
CREATE TABLE "security_test_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"tool" text NOT NULL,
	"scope" text NOT NULL,
	"status" text NOT NULL,
	"concurrency" integer DEFAULT 0 NOT NULL,
	"p95_ms" integer DEFAULT 0 NOT NULL,
	"p99_ms" integer DEFAULT 0 NOT NULL,
	"error_rate_bps" integer DEFAULT 0 NOT NULL,
	"critical_count" integer DEFAULT 0 NOT NULL,
	"high_count" integer DEFAULT 0 NOT NULL,
	"external_auditor" text NOT NULL,
	"report_file_id" text NOT NULL,
	"report_sha256" text NOT NULL,
	"executed_at" timestamptz NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "security_test_runs_tenant_status_idx" ON "security_test_runs" ("tenant_id","status","created_at");
CREATE TABLE "data_acceptance_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"migration_run_id" text NOT NULL,
	"rollback_run_id" text NOT NULL,
	"module" text NOT NULL,
	"source_sha256" text NOT NULL,
	"source_total" integer NOT NULL,
	"imported" integer NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"duplicates" integer DEFAULT 0 NOT NULL,
	"persisted_count" integer DEFAULT 0 NOT NULL,
	"sample_size" integer DEFAULT 0 NOT NULL,
	"reconciliation_status" text NOT NULL,
	"status" text NOT NULL,
	"customer_approver" text NOT NULL,
	"evidence_file_id" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"executed_at" timestamptz NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "data_acceptance_tenant_status_idx" ON "data_acceptance_runs" ("tenant_id","status","created_at");
CREATE TABLE "field_validation_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"device_id" text NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"manufacturer" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"os_version" text DEFAULT '' NOT NULL,
	"provider" text DEFAULT '' NOT NULL,
	"protocol" text DEFAULT '' NOT NULL,
	"scenario" text NOT NULL,
	"expected_outcome" text NOT NULL,
	"observed_outcome" text NOT NULL,
	"started_at" timestamptz NOT NULL,
	"ended_at" timestamptz NOT NULL,
	"duration_minutes" integer NOT NULL,
	"telemetry_count" integer DEFAULT 0 NOT NULL,
	"gateway_event_count" integer DEFAULT 0 NOT NULL,
	"max_gap_seconds" integer DEFAULT 0 NOT NULL,
	"battery_drop_percent" integer DEFAULT 0 NOT NULL,
	"crash_count" integer DEFAULT 0 NOT NULL,
	"permission_loss_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"evidence_file_id" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "field_validation_tenant_kind_status_idx" ON "field_validation_runs" ("tenant_id","kind","status","created_at");
CREATE TABLE "production_rollouts" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"phase" text NOT NULL,
	"target_percent" integer NOT NULL,
	"status" text NOT NULL,
	"started_at" timestamptz NOT NULL,
	"ended_at" timestamptz NOT NULL,
	"duration_minutes" integer NOT NULL,
	"readiness_passed" integer DEFAULT 0 NOT NULL,
	"readiness_total" integer DEFAULT 0 NOT NULL,
	"connected_providers" integer DEFAULT 0 NOT NULL,
	"provider_total" integer DEFAULT 0 NOT NULL,
	"critical_incident_count" integer DEFAULT 0 NOT NULL,
	"pending_outbox_count" integer DEFAULT 0 NOT NULL,
	"stale_telemetry_count" integer DEFAULT 0 NOT NULL,
	"owner_approver" text NOT NULL,
	"operations_approver" text NOT NULL,
	"rollback_plan" text NOT NULL,
	"rollback_triggered" integer DEFAULT 0 NOT NULL,
	"evidence_file_id" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "production_rollout_tenant_phase_status_idx" ON "production_rollouts" ("tenant_id","phase","status","created_at");
CREATE TABLE "e2e_acceptance_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"environment" text NOT NULL,
	"base_url" text NOT NULL,
	"runner" text NOT NULL,
	"browser" text NOT NULL,
	"api_total" integer NOT NULL,
	"api_passed" integer NOT NULL,
	"role_total" integer NOT NULL,
	"role_passed" integer NOT NULL,
	"tenant_total" integer NOT NULL,
	"tenant_passed" integer NOT NULL,
	"browser_total" integer NOT NULL,
	"browser_passed" integer NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"commit_sha" text NOT NULL,
	"evidence_file_id" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"executed_at" timestamptz NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "e2e_acceptance_tenant_status_idx" ON "e2e_acceptance_runs" ("tenant_id","status","created_at");
CREATE TABLE "operations_controls" (
	"id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"owner_team" text NOT NULL,
	"schedule" text NOT NULL,
	"target_minutes" integer NOT NULL,
	"escalation_minutes" integer NOT NULL,
	"retention_days" integer DEFAULT 0 NOT NULL,
	"runbook_url" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY("tenant_id", "id")
);

CREATE INDEX "operations_control_tenant_kind_idx" ON "operations_controls" ("tenant_id","kind");
CREATE TABLE "operations_readiness_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"status" text NOT NULL,
	"active_controls" integer NOT NULL,
	"required_controls" integer NOT NULL,
	"open_critical_alerts" integer NOT NULL,
	"restore_age_days" integer NOT NULL,
	"on_call_owner" text NOT NULL,
	"evidence_file_id" text NOT NULL,
	"evidence_sha256" text NOT NULL,
	"executed_at" timestamptz NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "operations_readiness_tenant_status_idx" ON "operations_readiness_runs" ("tenant_id","status","created_at");
CREATE TABLE "vehicle_catalog_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"version_id" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year_from" integer NOT NULL,
	"year_to" integer NOT NULL,
	"market" text NOT NULL,
	"body_type" text DEFAULT '' NOT NULL,
	"fuel_type" text DEFAULT '' NOT NULL,
	"external_code" text DEFAULT '' NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);

CREATE UNIQUE INDEX "vehicle_catalog_entry_uq" ON "vehicle_catalog_entries" ("tenant_id","version_id","make","model","market","year_from");
CREATE TABLE "vehicle_catalog_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"market" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"source_sha256" text NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "vehicle_catalog_tenant_version_uq" ON "vehicle_catalog_versions" ("tenant_id","version");
CREATE TABLE "vin_decode_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"vin" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"make" text DEFAULT '' NOT NULL,
	"model" text DEFAULT '' NOT NULL,
	"model_year" integer DEFAULT 0 NOT NULL,
	"market" text DEFAULT '' NOT NULL,
	"response_digest" text NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE INDEX "vin_decode_tenant_vin_idx" ON "vin_decode_events" ("tenant_id","vin","created_at");
CREATE TABLE "scheduled_job_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"job_name" text NOT NULL,
	"slot" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"started_at" timestamptz,
	"completed_at" timestamptz,
	"result" text DEFAULT '{}' NOT NULL,
	"last_error" text DEFAULT '' NOT NULL,
	"created_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	"updated_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "scheduled_job_tenant_slot_uq" ON "scheduled_job_runs" ("tenant_id","job_name","slot");
CREATE INDEX "scheduled_job_status_idx" ON "scheduled_job_runs" ("status","updated_at");
CREATE TABLE "tax_profile_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"version_id" text NOT NULL,
	"country_code" text NOT NULL,
	"region_code" text DEFAULT '' NOT NULL,
	"label" text NOT NULL,
	"currency" text NOT NULL,
	"tax_name" text NOT NULL,
	"rate_bps" integer NOT NULL,
	"category" text NOT NULL,
	"document_types" text DEFAULT '[]' NOT NULL,
	"reverse_charge" integer DEFAULT 0 NOT NULL,
	"effective_from" text NOT NULL,
	"effective_to" text,
	"source_url" text NOT NULL,
	"active" integer DEFAULT 1 NOT NULL
);

CREATE UNIQUE INDEX "tax_profile_entry_label_uq" ON "tax_profile_entries" ("tenant_id","version_id","label");
CREATE INDEX "tax_profile_lookup_idx" ON "tax_profile_entries" ("tenant_id","country_code","region_code","active","effective_from");
CREATE TABLE "tax_profile_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"version" text NOT NULL,
	"source" text NOT NULL,
	"status" text DEFAULT 'ACTIVE' NOT NULL,
	"entry_count" integer DEFAULT 0 NOT NULL,
	"source_sha256" text NOT NULL,
	"published_by" text NOT NULL,
	"published_at" timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE UNIQUE INDEX "tax_profile_tenant_version_uq" ON "tax_profile_versions" ("tenant_id","version");

CREATE OR REPLACE FUNCTION public.is_tenant_member(target_tenant text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.tenant_id = target_tenant
      AND lower(tm.email) = lower(auth.jwt()->>'email')
      AND tm.active = 1
  );
$$;
REVOKE ALL ON FUNCTION public.is_tenant_member(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(text) TO authenticated;


REVOKE ALL ON public."audit_events" FROM anon, authenticated;
ALTER TABLE public."audit_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_audit_events" ON public."audit_events";
CREATE POLICY "tenant_select_audit_events" ON public."audit_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("audit_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_audit_events" ON public."audit_events";
CREATE POLICY "tenant_insert_audit_events" ON public."audit_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("audit_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_audit_events" ON public."audit_events";
CREATE POLICY "tenant_update_audit_events" ON public."audit_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("audit_events".tenant_id))
WITH CHECK (public.is_tenant_member("audit_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_audit_events" ON public."audit_events";
CREATE POLICY "tenant_delete_audit_events" ON public."audit_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("audit_events".tenant_id));

REVOKE ALL ON public."consent_events" FROM anon, authenticated;
ALTER TABLE public."consent_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_consent_events" ON public."consent_events";
CREATE POLICY "tenant_select_consent_events" ON public."consent_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("consent_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_consent_events" ON public."consent_events";
CREATE POLICY "tenant_insert_consent_events" ON public."consent_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("consent_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_consent_events" ON public."consent_events";
CREATE POLICY "tenant_update_consent_events" ON public."consent_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("consent_events".tenant_id))
WITH CHECK (public.is_tenant_member("consent_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_consent_events" ON public."consent_events";
CREATE POLICY "tenant_delete_consent_events" ON public."consent_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("consent_events".tenant_id));

REVOKE ALL ON public."data_acceptance_runs" FROM anon, authenticated;
ALTER TABLE public."data_acceptance_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_data_acceptance_runs" ON public."data_acceptance_runs";
CREATE POLICY "tenant_select_data_acceptance_runs" ON public."data_acceptance_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("data_acceptance_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_data_acceptance_runs" ON public."data_acceptance_runs";
CREATE POLICY "tenant_insert_data_acceptance_runs" ON public."data_acceptance_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("data_acceptance_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_data_acceptance_runs" ON public."data_acceptance_runs";
CREATE POLICY "tenant_update_data_acceptance_runs" ON public."data_acceptance_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("data_acceptance_runs".tenant_id))
WITH CHECK (public.is_tenant_member("data_acceptance_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_data_acceptance_runs" ON public."data_acceptance_runs";
CREATE POLICY "tenant_delete_data_acceptance_runs" ON public."data_acceptance_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("data_acceptance_runs".tenant_id));

REVOKE ALL ON public."device_ingest_tokens" FROM anon, authenticated;
ALTER TABLE public."device_ingest_tokens" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_device_ingest_tokens" ON public."device_ingest_tokens";
CREATE POLICY "tenant_select_device_ingest_tokens" ON public."device_ingest_tokens" FOR SELECT TO authenticated
USING (public.is_tenant_member("device_ingest_tokens".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_device_ingest_tokens" ON public."device_ingest_tokens";
CREATE POLICY "tenant_insert_device_ingest_tokens" ON public."device_ingest_tokens" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("device_ingest_tokens".tenant_id));
DROP POLICY IF EXISTS "tenant_update_device_ingest_tokens" ON public."device_ingest_tokens";
CREATE POLICY "tenant_update_device_ingest_tokens" ON public."device_ingest_tokens" FOR UPDATE TO authenticated
USING (public.is_tenant_member("device_ingest_tokens".tenant_id))
WITH CHECK (public.is_tenant_member("device_ingest_tokens".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_device_ingest_tokens" ON public."device_ingest_tokens";
CREATE POLICY "tenant_delete_device_ingest_tokens" ON public."device_ingest_tokens" FOR DELETE TO authenticated
USING (public.is_tenant_member("device_ingest_tokens".tenant_id));

REVOKE ALL ON public."e2e_acceptance_runs" FROM anon, authenticated;
ALTER TABLE public."e2e_acceptance_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_e2e_acceptance_runs" ON public."e2e_acceptance_runs";
CREATE POLICY "tenant_select_e2e_acceptance_runs" ON public."e2e_acceptance_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("e2e_acceptance_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_e2e_acceptance_runs" ON public."e2e_acceptance_runs";
CREATE POLICY "tenant_insert_e2e_acceptance_runs" ON public."e2e_acceptance_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("e2e_acceptance_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_e2e_acceptance_runs" ON public."e2e_acceptance_runs";
CREATE POLICY "tenant_update_e2e_acceptance_runs" ON public."e2e_acceptance_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("e2e_acceptance_runs".tenant_id))
WITH CHECK (public.is_tenant_member("e2e_acceptance_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_e2e_acceptance_runs" ON public."e2e_acceptance_runs";
CREATE POLICY "tenant_delete_e2e_acceptance_runs" ON public."e2e_acceptance_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("e2e_acceptance_runs".tenant_id));

REVOKE ALL ON public."e_documents" FROM anon, authenticated;
ALTER TABLE public."e_documents" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_e_documents" ON public."e_documents";
CREATE POLICY "tenant_select_e_documents" ON public."e_documents" FOR SELECT TO authenticated
USING (public.is_tenant_member("e_documents".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_e_documents" ON public."e_documents";
CREATE POLICY "tenant_insert_e_documents" ON public."e_documents" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("e_documents".tenant_id));
DROP POLICY IF EXISTS "tenant_update_e_documents" ON public."e_documents";
CREATE POLICY "tenant_update_e_documents" ON public."e_documents" FOR UPDATE TO authenticated
USING (public.is_tenant_member("e_documents".tenant_id))
WITH CHECK (public.is_tenant_member("e_documents".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_e_documents" ON public."e_documents";
CREATE POLICY "tenant_delete_e_documents" ON public."e_documents" FOR DELETE TO authenticated
USING (public.is_tenant_member("e_documents".tenant_id));

REVOKE ALL ON public."field_validation_runs" FROM anon, authenticated;
ALTER TABLE public."field_validation_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_field_validation_runs" ON public."field_validation_runs";
CREATE POLICY "tenant_select_field_validation_runs" ON public."field_validation_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("field_validation_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_field_validation_runs" ON public."field_validation_runs";
CREATE POLICY "tenant_insert_field_validation_runs" ON public."field_validation_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("field_validation_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_field_validation_runs" ON public."field_validation_runs";
CREATE POLICY "tenant_update_field_validation_runs" ON public."field_validation_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("field_validation_runs".tenant_id))
WITH CHECK (public.is_tenant_member("field_validation_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_field_validation_runs" ON public."field_validation_runs";
CREATE POLICY "tenant_delete_field_validation_runs" ON public."field_validation_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("field_validation_runs".tenant_id));

REVOKE ALL ON public."file_objects" FROM anon, authenticated;
ALTER TABLE public."file_objects" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_file_objects" ON public."file_objects";
CREATE POLICY "tenant_select_file_objects" ON public."file_objects" FOR SELECT TO authenticated
USING (public.is_tenant_member("file_objects".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_file_objects" ON public."file_objects";
CREATE POLICY "tenant_insert_file_objects" ON public."file_objects" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("file_objects".tenant_id));
DROP POLICY IF EXISTS "tenant_update_file_objects" ON public."file_objects";
CREATE POLICY "tenant_update_file_objects" ON public."file_objects" FOR UPDATE TO authenticated
USING (public.is_tenant_member("file_objects".tenant_id))
WITH CHECK (public.is_tenant_member("file_objects".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_file_objects" ON public."file_objects";
CREATE POLICY "tenant_delete_file_objects" ON public."file_objects" FOR DELETE TO authenticated
USING (public.is_tenant_member("file_objects".tenant_id));

REVOKE ALL ON public."migration_runs" FROM anon, authenticated;
ALTER TABLE public."migration_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_migration_runs" ON public."migration_runs";
CREATE POLICY "tenant_select_migration_runs" ON public."migration_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("migration_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_migration_runs" ON public."migration_runs";
CREATE POLICY "tenant_insert_migration_runs" ON public."migration_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("migration_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_migration_runs" ON public."migration_runs";
CREATE POLICY "tenant_update_migration_runs" ON public."migration_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("migration_runs".tenant_id))
WITH CHECK (public.is_tenant_member("migration_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_migration_runs" ON public."migration_runs";
CREATE POLICY "tenant_delete_migration_runs" ON public."migration_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("migration_runs".tenant_id));

REVOKE ALL ON public."mobile_installations" FROM anon, authenticated;
ALTER TABLE public."mobile_installations" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_mobile_installations" ON public."mobile_installations";
CREATE POLICY "tenant_select_mobile_installations" ON public."mobile_installations" FOR SELECT TO authenticated
USING (public.is_tenant_member("mobile_installations".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_mobile_installations" ON public."mobile_installations";
CREATE POLICY "tenant_insert_mobile_installations" ON public."mobile_installations" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("mobile_installations".tenant_id));
DROP POLICY IF EXISTS "tenant_update_mobile_installations" ON public."mobile_installations";
CREATE POLICY "tenant_update_mobile_installations" ON public."mobile_installations" FOR UPDATE TO authenticated
USING (public.is_tenant_member("mobile_installations".tenant_id))
WITH CHECK (public.is_tenant_member("mobile_installations".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_mobile_installations" ON public."mobile_installations";
CREATE POLICY "tenant_delete_mobile_installations" ON public."mobile_installations" FOR DELETE TO authenticated
USING (public.is_tenant_member("mobile_installations".tenant_id));

REVOKE ALL ON public."mobile_releases" FROM anon, authenticated;
ALTER TABLE public."mobile_releases" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_mobile_releases" ON public."mobile_releases";
CREATE POLICY "tenant_select_mobile_releases" ON public."mobile_releases" FOR SELECT TO authenticated
USING (public.is_tenant_member("mobile_releases".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_mobile_releases" ON public."mobile_releases";
CREATE POLICY "tenant_insert_mobile_releases" ON public."mobile_releases" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("mobile_releases".tenant_id));
DROP POLICY IF EXISTS "tenant_update_mobile_releases" ON public."mobile_releases";
CREATE POLICY "tenant_update_mobile_releases" ON public."mobile_releases" FOR UPDATE TO authenticated
USING (public.is_tenant_member("mobile_releases".tenant_id))
WITH CHECK (public.is_tenant_member("mobile_releases".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_mobile_releases" ON public."mobile_releases";
CREATE POLICY "tenant_delete_mobile_releases" ON public."mobile_releases" FOR DELETE TO authenticated
USING (public.is_tenant_member("mobile_releases".tenant_id));

REVOKE ALL ON public."module_records" FROM anon, authenticated;
ALTER TABLE public."module_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_module_records" ON public."module_records";
CREATE POLICY "tenant_select_module_records" ON public."module_records" FOR SELECT TO authenticated
USING (public.is_tenant_member("module_records".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_module_records" ON public."module_records";
CREATE POLICY "tenant_insert_module_records" ON public."module_records" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("module_records".tenant_id));
DROP POLICY IF EXISTS "tenant_update_module_records" ON public."module_records";
CREATE POLICY "tenant_update_module_records" ON public."module_records" FOR UPDATE TO authenticated
USING (public.is_tenant_member("module_records".tenant_id))
WITH CHECK (public.is_tenant_member("module_records".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_module_records" ON public."module_records";
CREATE POLICY "tenant_delete_module_records" ON public."module_records" FOR DELETE TO authenticated
USING (public.is_tenant_member("module_records".tenant_id));

REVOKE ALL ON public."monitoring_events" FROM anon, authenticated;
ALTER TABLE public."monitoring_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_monitoring_events" ON public."monitoring_events";
CREATE POLICY "tenant_select_monitoring_events" ON public."monitoring_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("monitoring_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_monitoring_events" ON public."monitoring_events";
CREATE POLICY "tenant_insert_monitoring_events" ON public."monitoring_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("monitoring_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_monitoring_events" ON public."monitoring_events";
CREATE POLICY "tenant_update_monitoring_events" ON public."monitoring_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("monitoring_events".tenant_id))
WITH CHECK (public.is_tenant_member("monitoring_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_monitoring_events" ON public."monitoring_events";
CREATE POLICY "tenant_delete_monitoring_events" ON public."monitoring_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("monitoring_events".tenant_id));

REVOKE ALL ON public."notification_deliveries" FROM anon, authenticated;
ALTER TABLE public."notification_deliveries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_notification_deliveries" ON public."notification_deliveries";
CREATE POLICY "tenant_select_notification_deliveries" ON public."notification_deliveries" FOR SELECT TO authenticated
USING (public.is_tenant_member("notification_deliveries".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_notification_deliveries" ON public."notification_deliveries";
CREATE POLICY "tenant_insert_notification_deliveries" ON public."notification_deliveries" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("notification_deliveries".tenant_id));
DROP POLICY IF EXISTS "tenant_update_notification_deliveries" ON public."notification_deliveries";
CREATE POLICY "tenant_update_notification_deliveries" ON public."notification_deliveries" FOR UPDATE TO authenticated
USING (public.is_tenant_member("notification_deliveries".tenant_id))
WITH CHECK (public.is_tenant_member("notification_deliveries".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_notification_deliveries" ON public."notification_deliveries";
CREATE POLICY "tenant_delete_notification_deliveries" ON public."notification_deliveries" FOR DELETE TO authenticated
USING (public.is_tenant_member("notification_deliveries".tenant_id));

REVOKE ALL ON public."operations_controls" FROM anon, authenticated;
ALTER TABLE public."operations_controls" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_operations_controls" ON public."operations_controls";
CREATE POLICY "tenant_select_operations_controls" ON public."operations_controls" FOR SELECT TO authenticated
USING (public.is_tenant_member("operations_controls".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_operations_controls" ON public."operations_controls";
CREATE POLICY "tenant_insert_operations_controls" ON public."operations_controls" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("operations_controls".tenant_id));
DROP POLICY IF EXISTS "tenant_update_operations_controls" ON public."operations_controls";
CREATE POLICY "tenant_update_operations_controls" ON public."operations_controls" FOR UPDATE TO authenticated
USING (public.is_tenant_member("operations_controls".tenant_id))
WITH CHECK (public.is_tenant_member("operations_controls".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_operations_controls" ON public."operations_controls";
CREATE POLICY "tenant_delete_operations_controls" ON public."operations_controls" FOR DELETE TO authenticated
USING (public.is_tenant_member("operations_controls".tenant_id));

REVOKE ALL ON public."operations_readiness_runs" FROM anon, authenticated;
ALTER TABLE public."operations_readiness_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_operations_readiness_runs" ON public."operations_readiness_runs";
CREATE POLICY "tenant_select_operations_readiness_runs" ON public."operations_readiness_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("operations_readiness_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_operations_readiness_runs" ON public."operations_readiness_runs";
CREATE POLICY "tenant_insert_operations_readiness_runs" ON public."operations_readiness_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("operations_readiness_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_operations_readiness_runs" ON public."operations_readiness_runs";
CREATE POLICY "tenant_update_operations_readiness_runs" ON public."operations_readiness_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("operations_readiness_runs".tenant_id))
WITH CHECK (public.is_tenant_member("operations_readiness_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_operations_readiness_runs" ON public."operations_readiness_runs";
CREATE POLICY "tenant_delete_operations_readiness_runs" ON public."operations_readiness_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("operations_readiness_runs".tenant_id));

REVOKE ALL ON public."outbox_events" FROM anon, authenticated;
ALTER TABLE public."outbox_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_outbox_events" ON public."outbox_events";
CREATE POLICY "tenant_select_outbox_events" ON public."outbox_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("outbox_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_outbox_events" ON public."outbox_events";
CREATE POLICY "tenant_insert_outbox_events" ON public."outbox_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("outbox_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_outbox_events" ON public."outbox_events";
CREATE POLICY "tenant_update_outbox_events" ON public."outbox_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("outbox_events".tenant_id))
WITH CHECK (public.is_tenant_member("outbox_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_outbox_events" ON public."outbox_events";
CREATE POLICY "tenant_delete_outbox_events" ON public."outbox_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("outbox_events".tenant_id));

REVOKE ALL ON public."pilot_runs" FROM anon, authenticated;
ALTER TABLE public."pilot_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_pilot_runs" ON public."pilot_runs";
CREATE POLICY "tenant_select_pilot_runs" ON public."pilot_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("pilot_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_pilot_runs" ON public."pilot_runs";
CREATE POLICY "tenant_insert_pilot_runs" ON public."pilot_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("pilot_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_pilot_runs" ON public."pilot_runs";
CREATE POLICY "tenant_update_pilot_runs" ON public."pilot_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("pilot_runs".tenant_id))
WITH CHECK (public.is_tenant_member("pilot_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_pilot_runs" ON public."pilot_runs";
CREATE POLICY "tenant_delete_pilot_runs" ON public."pilot_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("pilot_runs".tenant_id));

REVOKE ALL ON public."pilot_scenarios" FROM anon, authenticated;
ALTER TABLE public."pilot_scenarios" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_pilot_scenarios" ON public."pilot_scenarios";
CREATE POLICY "tenant_select_pilot_scenarios" ON public."pilot_scenarios" FOR SELECT TO authenticated
USING (public.is_tenant_member("pilot_scenarios".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_pilot_scenarios" ON public."pilot_scenarios";
CREATE POLICY "tenant_insert_pilot_scenarios" ON public."pilot_scenarios" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("pilot_scenarios".tenant_id));
DROP POLICY IF EXISTS "tenant_update_pilot_scenarios" ON public."pilot_scenarios";
CREATE POLICY "tenant_update_pilot_scenarios" ON public."pilot_scenarios" FOR UPDATE TO authenticated
USING (public.is_tenant_member("pilot_scenarios".tenant_id))
WITH CHECK (public.is_tenant_member("pilot_scenarios".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_pilot_scenarios" ON public."pilot_scenarios";
CREATE POLICY "tenant_delete_pilot_scenarios" ON public."pilot_scenarios" FOR DELETE TO authenticated
USING (public.is_tenant_member("pilot_scenarios".tenant_id));

REVOKE ALL ON public."production_rollouts" FROM anon, authenticated;
ALTER TABLE public."production_rollouts" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_production_rollouts" ON public."production_rollouts";
CREATE POLICY "tenant_select_production_rollouts" ON public."production_rollouts" FOR SELECT TO authenticated
USING (public.is_tenant_member("production_rollouts".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_production_rollouts" ON public."production_rollouts";
CREATE POLICY "tenant_insert_production_rollouts" ON public."production_rollouts" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("production_rollouts".tenant_id));
DROP POLICY IF EXISTS "tenant_update_production_rollouts" ON public."production_rollouts";
CREATE POLICY "tenant_update_production_rollouts" ON public."production_rollouts" FOR UPDATE TO authenticated
USING (public.is_tenant_member("production_rollouts".tenant_id))
WITH CHECK (public.is_tenant_member("production_rollouts".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_production_rollouts" ON public."production_rollouts";
CREATE POLICY "tenant_delete_production_rollouts" ON public."production_rollouts" FOR DELETE TO authenticated
USING (public.is_tenant_member("production_rollouts".tenant_id));

REVOKE ALL ON public."provider_callback_events" FROM anon, authenticated;
ALTER TABLE public."provider_callback_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_provider_callback_events" ON public."provider_callback_events";
CREATE POLICY "tenant_select_provider_callback_events" ON public."provider_callback_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("provider_callback_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_provider_callback_events" ON public."provider_callback_events";
CREATE POLICY "tenant_insert_provider_callback_events" ON public."provider_callback_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("provider_callback_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_provider_callback_events" ON public."provider_callback_events";
CREATE POLICY "tenant_update_provider_callback_events" ON public."provider_callback_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("provider_callback_events".tenant_id))
WITH CHECK (public.is_tenant_member("provider_callback_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_provider_callback_events" ON public."provider_callback_events";
CREATE POLICY "tenant_delete_provider_callback_events" ON public."provider_callback_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("provider_callback_events".tenant_id));

REVOKE ALL ON public."provider_connections" FROM anon, authenticated;
ALTER TABLE public."provider_connections" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_provider_connections" ON public."provider_connections";
CREATE POLICY "tenant_select_provider_connections" ON public."provider_connections" FOR SELECT TO authenticated
USING (public.is_tenant_member("provider_connections".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_provider_connections" ON public."provider_connections";
CREATE POLICY "tenant_insert_provider_connections" ON public."provider_connections" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("provider_connections".tenant_id));
DROP POLICY IF EXISTS "tenant_update_provider_connections" ON public."provider_connections";
CREATE POLICY "tenant_update_provider_connections" ON public."provider_connections" FOR UPDATE TO authenticated
USING (public.is_tenant_member("provider_connections".tenant_id))
WITH CHECK (public.is_tenant_member("provider_connections".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_provider_connections" ON public."provider_connections";
CREATE POLICY "tenant_delete_provider_connections" ON public."provider_connections" FOR DELETE TO authenticated
USING (public.is_tenant_member("provider_connections".tenant_id));

REVOKE ALL ON public."provider_dispatches" FROM anon, authenticated;
ALTER TABLE public."provider_dispatches" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_provider_dispatches" ON public."provider_dispatches";
CREATE POLICY "tenant_select_provider_dispatches" ON public."provider_dispatches" FOR SELECT TO authenticated
USING (public.is_tenant_member("provider_dispatches".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_provider_dispatches" ON public."provider_dispatches";
CREATE POLICY "tenant_insert_provider_dispatches" ON public."provider_dispatches" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("provider_dispatches".tenant_id));
DROP POLICY IF EXISTS "tenant_update_provider_dispatches" ON public."provider_dispatches";
CREATE POLICY "tenant_update_provider_dispatches" ON public."provider_dispatches" FOR UPDATE TO authenticated
USING (public.is_tenant_member("provider_dispatches".tenant_id))
WITH CHECK (public.is_tenant_member("provider_dispatches".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_provider_dispatches" ON public."provider_dispatches";
CREATE POLICY "tenant_delete_provider_dispatches" ON public."provider_dispatches" FOR DELETE TO authenticated
USING (public.is_tenant_member("provider_dispatches".tenant_id));

REVOKE ALL ON public."record_links" FROM anon, authenticated;
ALTER TABLE public."record_links" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_record_links" ON public."record_links";
CREATE POLICY "tenant_select_record_links" ON public."record_links" FOR SELECT TO authenticated
USING (public.is_tenant_member("record_links".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_record_links" ON public."record_links";
CREATE POLICY "tenant_insert_record_links" ON public."record_links" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("record_links".tenant_id));
DROP POLICY IF EXISTS "tenant_update_record_links" ON public."record_links";
CREATE POLICY "tenant_update_record_links" ON public."record_links" FOR UPDATE TO authenticated
USING (public.is_tenant_member("record_links".tenant_id))
WITH CHECK (public.is_tenant_member("record_links".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_record_links" ON public."record_links";
CREATE POLICY "tenant_delete_record_links" ON public."record_links" FOR DELETE TO authenticated
USING (public.is_tenant_member("record_links".tenant_id));

REVOKE ALL ON public."restore_rehearsals" FROM anon, authenticated;
ALTER TABLE public."restore_rehearsals" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_restore_rehearsals" ON public."restore_rehearsals";
CREATE POLICY "tenant_select_restore_rehearsals" ON public."restore_rehearsals" FOR SELECT TO authenticated
USING (public.is_tenant_member("restore_rehearsals".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_restore_rehearsals" ON public."restore_rehearsals";
CREATE POLICY "tenant_insert_restore_rehearsals" ON public."restore_rehearsals" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("restore_rehearsals".tenant_id));
DROP POLICY IF EXISTS "tenant_update_restore_rehearsals" ON public."restore_rehearsals";
CREATE POLICY "tenant_update_restore_rehearsals" ON public."restore_rehearsals" FOR UPDATE TO authenticated
USING (public.is_tenant_member("restore_rehearsals".tenant_id))
WITH CHECK (public.is_tenant_member("restore_rehearsals".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_restore_rehearsals" ON public."restore_rehearsals";
CREATE POLICY "tenant_delete_restore_rehearsals" ON public."restore_rehearsals" FOR DELETE TO authenticated
USING (public.is_tenant_member("restore_rehearsals".tenant_id));

REVOKE ALL ON public."restore_staging_records" FROM anon, authenticated;
ALTER TABLE public."restore_staging_records" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_restore_staging_records" ON public."restore_staging_records";
CREATE POLICY "tenant_select_restore_staging_records" ON public."restore_staging_records" FOR SELECT TO authenticated
USING (public.is_tenant_member("restore_staging_records".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_restore_staging_records" ON public."restore_staging_records";
CREATE POLICY "tenant_insert_restore_staging_records" ON public."restore_staging_records" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("restore_staging_records".tenant_id));
DROP POLICY IF EXISTS "tenant_update_restore_staging_records" ON public."restore_staging_records";
CREATE POLICY "tenant_update_restore_staging_records" ON public."restore_staging_records" FOR UPDATE TO authenticated
USING (public.is_tenant_member("restore_staging_records".tenant_id))
WITH CHECK (public.is_tenant_member("restore_staging_records".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_restore_staging_records" ON public."restore_staging_records";
CREATE POLICY "tenant_delete_restore_staging_records" ON public."restore_staging_records" FOR DELETE TO authenticated
USING (public.is_tenant_member("restore_staging_records".tenant_id));

REVOKE ALL ON public."scheduled_job_runs" FROM anon, authenticated;
ALTER TABLE public."scheduled_job_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_scheduled_job_runs" ON public."scheduled_job_runs";
CREATE POLICY "tenant_select_scheduled_job_runs" ON public."scheduled_job_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("scheduled_job_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_scheduled_job_runs" ON public."scheduled_job_runs";
CREATE POLICY "tenant_insert_scheduled_job_runs" ON public."scheduled_job_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("scheduled_job_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_scheduled_job_runs" ON public."scheduled_job_runs";
CREATE POLICY "tenant_update_scheduled_job_runs" ON public."scheduled_job_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("scheduled_job_runs".tenant_id))
WITH CHECK (public.is_tenant_member("scheduled_job_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_scheduled_job_runs" ON public."scheduled_job_runs";
CREATE POLICY "tenant_delete_scheduled_job_runs" ON public."scheduled_job_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("scheduled_job_runs".tenant_id));

REVOKE ALL ON public."security_findings" FROM anon, authenticated;
ALTER TABLE public."security_findings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_security_findings" ON public."security_findings";
CREATE POLICY "tenant_select_security_findings" ON public."security_findings" FOR SELECT TO authenticated
USING (public.is_tenant_member("security_findings".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_security_findings" ON public."security_findings";
CREATE POLICY "tenant_insert_security_findings" ON public."security_findings" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("security_findings".tenant_id));
DROP POLICY IF EXISTS "tenant_update_security_findings" ON public."security_findings";
CREATE POLICY "tenant_update_security_findings" ON public."security_findings" FOR UPDATE TO authenticated
USING (public.is_tenant_member("security_findings".tenant_id))
WITH CHECK (public.is_tenant_member("security_findings".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_security_findings" ON public."security_findings";
CREATE POLICY "tenant_delete_security_findings" ON public."security_findings" FOR DELETE TO authenticated
USING (public.is_tenant_member("security_findings".tenant_id));

REVOKE ALL ON public."security_test_runs" FROM anon, authenticated;
ALTER TABLE public."security_test_runs" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_security_test_runs" ON public."security_test_runs";
CREATE POLICY "tenant_select_security_test_runs" ON public."security_test_runs" FOR SELECT TO authenticated
USING (public.is_tenant_member("security_test_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_security_test_runs" ON public."security_test_runs";
CREATE POLICY "tenant_insert_security_test_runs" ON public."security_test_runs" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("security_test_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_update_security_test_runs" ON public."security_test_runs";
CREATE POLICY "tenant_update_security_test_runs" ON public."security_test_runs" FOR UPDATE TO authenticated
USING (public.is_tenant_member("security_test_runs".tenant_id))
WITH CHECK (public.is_tenant_member("security_test_runs".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_security_test_runs" ON public."security_test_runs";
CREATE POLICY "tenant_delete_security_test_runs" ON public."security_test_runs" FOR DELETE TO authenticated
USING (public.is_tenant_member("security_test_runs".tenant_id));

REVOKE ALL ON public."settings" FROM anon, authenticated;
ALTER TABLE public."settings" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_settings" ON public."settings";
CREATE POLICY "tenant_select_settings" ON public."settings" FOR SELECT TO authenticated
USING (public.is_tenant_member("settings".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_settings" ON public."settings";
CREATE POLICY "tenant_insert_settings" ON public."settings" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("settings".tenant_id));
DROP POLICY IF EXISTS "tenant_update_settings" ON public."settings";
CREATE POLICY "tenant_update_settings" ON public."settings" FOR UPDATE TO authenticated
USING (public.is_tenant_member("settings".tenant_id))
WITH CHECK (public.is_tenant_member("settings".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_settings" ON public."settings";
CREATE POLICY "tenant_delete_settings" ON public."settings" FOR DELETE TO authenticated
USING (public.is_tenant_member("settings".tenant_id));

REVOKE ALL ON public."signature_requests" FROM anon, authenticated;
ALTER TABLE public."signature_requests" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_signature_requests" ON public."signature_requests";
CREATE POLICY "tenant_select_signature_requests" ON public."signature_requests" FOR SELECT TO authenticated
USING (public.is_tenant_member("signature_requests".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_signature_requests" ON public."signature_requests";
CREATE POLICY "tenant_insert_signature_requests" ON public."signature_requests" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("signature_requests".tenant_id));
DROP POLICY IF EXISTS "tenant_update_signature_requests" ON public."signature_requests";
CREATE POLICY "tenant_update_signature_requests" ON public."signature_requests" FOR UPDATE TO authenticated
USING (public.is_tenant_member("signature_requests".tenant_id))
WITH CHECK (public.is_tenant_member("signature_requests".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_signature_requests" ON public."signature_requests";
CREATE POLICY "tenant_delete_signature_requests" ON public."signature_requests" FOR DELETE TO authenticated
USING (public.is_tenant_member("signature_requests".tenant_id));

REVOKE ALL ON public."subscription_orders" FROM anon, authenticated;
ALTER TABLE public."subscription_orders" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_subscription_orders" ON public."subscription_orders";
CREATE POLICY "tenant_select_subscription_orders" ON public."subscription_orders" FOR SELECT TO authenticated
USING (public.is_tenant_member("subscription_orders".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_subscription_orders" ON public."subscription_orders";
CREATE POLICY "tenant_insert_subscription_orders" ON public."subscription_orders" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("subscription_orders".tenant_id));
DROP POLICY IF EXISTS "tenant_update_subscription_orders" ON public."subscription_orders";
CREATE POLICY "tenant_update_subscription_orders" ON public."subscription_orders" FOR UPDATE TO authenticated
USING (public.is_tenant_member("subscription_orders".tenant_id))
WITH CHECK (public.is_tenant_member("subscription_orders".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_subscription_orders" ON public."subscription_orders";
CREATE POLICY "tenant_delete_subscription_orders" ON public."subscription_orders" FOR DELETE TO authenticated
USING (public.is_tenant_member("subscription_orders".tenant_id));

REVOKE ALL ON public."support_tickets" FROM anon, authenticated;
ALTER TABLE public."support_tickets" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_support_tickets" ON public."support_tickets";
CREATE POLICY "tenant_select_support_tickets" ON public."support_tickets" FOR SELECT TO authenticated
USING (public.is_tenant_member("support_tickets".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_support_tickets" ON public."support_tickets";
CREATE POLICY "tenant_insert_support_tickets" ON public."support_tickets" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("support_tickets".tenant_id));
DROP POLICY IF EXISTS "tenant_update_support_tickets" ON public."support_tickets";
CREATE POLICY "tenant_update_support_tickets" ON public."support_tickets" FOR UPDATE TO authenticated
USING (public.is_tenant_member("support_tickets".tenant_id))
WITH CHECK (public.is_tenant_member("support_tickets".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_support_tickets" ON public."support_tickets";
CREATE POLICY "tenant_delete_support_tickets" ON public."support_tickets" FOR DELETE TO authenticated
USING (public.is_tenant_member("support_tickets".tenant_id));

REVOKE ALL ON public."tax_profile_entries" FROM anon, authenticated;
ALTER TABLE public."tax_profile_entries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_tax_profile_entries" ON public."tax_profile_entries";
CREATE POLICY "tenant_select_tax_profile_entries" ON public."tax_profile_entries" FOR SELECT TO authenticated
USING (public.is_tenant_member("tax_profile_entries".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_tax_profile_entries" ON public."tax_profile_entries";
CREATE POLICY "tenant_insert_tax_profile_entries" ON public."tax_profile_entries" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("tax_profile_entries".tenant_id));
DROP POLICY IF EXISTS "tenant_update_tax_profile_entries" ON public."tax_profile_entries";
CREATE POLICY "tenant_update_tax_profile_entries" ON public."tax_profile_entries" FOR UPDATE TO authenticated
USING (public.is_tenant_member("tax_profile_entries".tenant_id))
WITH CHECK (public.is_tenant_member("tax_profile_entries".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_tax_profile_entries" ON public."tax_profile_entries";
CREATE POLICY "tenant_delete_tax_profile_entries" ON public."tax_profile_entries" FOR DELETE TO authenticated
USING (public.is_tenant_member("tax_profile_entries".tenant_id));

REVOKE ALL ON public."tax_profile_versions" FROM anon, authenticated;
ALTER TABLE public."tax_profile_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_tax_profile_versions" ON public."tax_profile_versions";
CREATE POLICY "tenant_select_tax_profile_versions" ON public."tax_profile_versions" FOR SELECT TO authenticated
USING (public.is_tenant_member("tax_profile_versions".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_tax_profile_versions" ON public."tax_profile_versions";
CREATE POLICY "tenant_insert_tax_profile_versions" ON public."tax_profile_versions" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("tax_profile_versions".tenant_id));
DROP POLICY IF EXISTS "tenant_update_tax_profile_versions" ON public."tax_profile_versions";
CREATE POLICY "tenant_update_tax_profile_versions" ON public."tax_profile_versions" FOR UPDATE TO authenticated
USING (public.is_tenant_member("tax_profile_versions".tenant_id))
WITH CHECK (public.is_tenant_member("tax_profile_versions".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_tax_profile_versions" ON public."tax_profile_versions";
CREATE POLICY "tenant_delete_tax_profile_versions" ON public."tax_profile_versions" FOR DELETE TO authenticated
USING (public.is_tenant_member("tax_profile_versions".tenant_id));

REVOKE ALL ON public."teams" FROM anon, authenticated;
ALTER TABLE public."teams" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_teams" ON public."teams";
CREATE POLICY "tenant_select_teams" ON public."teams" FOR SELECT TO authenticated
USING (public.is_tenant_member("teams".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_teams" ON public."teams";
CREATE POLICY "tenant_insert_teams" ON public."teams" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("teams".tenant_id));
DROP POLICY IF EXISTS "tenant_update_teams" ON public."teams";
CREATE POLICY "tenant_update_teams" ON public."teams" FOR UPDATE TO authenticated
USING (public.is_tenant_member("teams".tenant_id))
WITH CHECK (public.is_tenant_member("teams".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_teams" ON public."teams";
CREATE POLICY "tenant_delete_teams" ON public."teams" FOR DELETE TO authenticated
USING (public.is_tenant_member("teams".tenant_id));

REVOKE ALL ON public."telemetry_events" FROM anon, authenticated;
ALTER TABLE public."telemetry_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_telemetry_events" ON public."telemetry_events";
CREATE POLICY "tenant_select_telemetry_events" ON public."telemetry_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("telemetry_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_telemetry_events" ON public."telemetry_events";
CREATE POLICY "tenant_insert_telemetry_events" ON public."telemetry_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("telemetry_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_telemetry_events" ON public."telemetry_events";
CREATE POLICY "tenant_update_telemetry_events" ON public."telemetry_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("telemetry_events".tenant_id))
WITH CHECK (public.is_tenant_member("telemetry_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_telemetry_events" ON public."telemetry_events";
CREATE POLICY "tenant_delete_telemetry_events" ON public."telemetry_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("telemetry_events".tenant_id));

REVOKE ALL ON public."tenant_members" FROM anon, authenticated;
ALTER TABLE public."tenant_members" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_tenant_members" ON public."tenant_members";
CREATE POLICY "tenant_select_tenant_members" ON public."tenant_members" FOR SELECT TO authenticated
USING (public.is_tenant_member("tenant_members".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_tenant_members" ON public."tenant_members";
CREATE POLICY "tenant_insert_tenant_members" ON public."tenant_members" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("tenant_members".tenant_id));
DROP POLICY IF EXISTS "tenant_update_tenant_members" ON public."tenant_members";
CREATE POLICY "tenant_update_tenant_members" ON public."tenant_members" FOR UPDATE TO authenticated
USING (public.is_tenant_member("tenant_members".tenant_id))
WITH CHECK (public.is_tenant_member("tenant_members".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_tenant_members" ON public."tenant_members";
CREATE POLICY "tenant_delete_tenant_members" ON public."tenant_members" FOR DELETE TO authenticated
USING (public.is_tenant_member("tenant_members".tenant_id));

REVOKE ALL ON public."tracker_gateway_events" FROM anon, authenticated;
ALTER TABLE public."tracker_gateway_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_tracker_gateway_events" ON public."tracker_gateway_events";
CREATE POLICY "tenant_select_tracker_gateway_events" ON public."tracker_gateway_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("tracker_gateway_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_tracker_gateway_events" ON public."tracker_gateway_events";
CREATE POLICY "tenant_insert_tracker_gateway_events" ON public."tracker_gateway_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("tracker_gateway_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_tracker_gateway_events" ON public."tracker_gateway_events";
CREATE POLICY "tenant_update_tracker_gateway_events" ON public."tracker_gateway_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("tracker_gateway_events".tenant_id))
WITH CHECK (public.is_tenant_member("tracker_gateway_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_tracker_gateway_events" ON public."tracker_gateway_events";
CREATE POLICY "tenant_delete_tracker_gateway_events" ON public."tracker_gateway_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("tracker_gateway_events".tenant_id));

REVOKE ALL ON public."tracking_sessions" FROM anon, authenticated;
ALTER TABLE public."tracking_sessions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_tracking_sessions" ON public."tracking_sessions";
CREATE POLICY "tenant_select_tracking_sessions" ON public."tracking_sessions" FOR SELECT TO authenticated
USING (public.is_tenant_member("tracking_sessions".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_tracking_sessions" ON public."tracking_sessions";
CREATE POLICY "tenant_insert_tracking_sessions" ON public."tracking_sessions" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("tracking_sessions".tenant_id));
DROP POLICY IF EXISTS "tenant_update_tracking_sessions" ON public."tracking_sessions";
CREATE POLICY "tenant_update_tracking_sessions" ON public."tracking_sessions" FOR UPDATE TO authenticated
USING (public.is_tenant_member("tracking_sessions".tenant_id))
WITH CHECK (public.is_tenant_member("tracking_sessions".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_tracking_sessions" ON public."tracking_sessions";
CREATE POLICY "tenant_delete_tracking_sessions" ON public."tracking_sessions" FOR DELETE TO authenticated
USING (public.is_tenant_member("tracking_sessions".tenant_id));

REVOKE ALL ON public."vehicle_catalog_entries" FROM anon, authenticated;
ALTER TABLE public."vehicle_catalog_entries" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_vehicle_catalog_entries" ON public."vehicle_catalog_entries";
CREATE POLICY "tenant_select_vehicle_catalog_entries" ON public."vehicle_catalog_entries" FOR SELECT TO authenticated
USING (public.is_tenant_member("vehicle_catalog_entries".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_vehicle_catalog_entries" ON public."vehicle_catalog_entries";
CREATE POLICY "tenant_insert_vehicle_catalog_entries" ON public."vehicle_catalog_entries" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("vehicle_catalog_entries".tenant_id));
DROP POLICY IF EXISTS "tenant_update_vehicle_catalog_entries" ON public."vehicle_catalog_entries";
CREATE POLICY "tenant_update_vehicle_catalog_entries" ON public."vehicle_catalog_entries" FOR UPDATE TO authenticated
USING (public.is_tenant_member("vehicle_catalog_entries".tenant_id))
WITH CHECK (public.is_tenant_member("vehicle_catalog_entries".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_vehicle_catalog_entries" ON public."vehicle_catalog_entries";
CREATE POLICY "tenant_delete_vehicle_catalog_entries" ON public."vehicle_catalog_entries" FOR DELETE TO authenticated
USING (public.is_tenant_member("vehicle_catalog_entries".tenant_id));

REVOKE ALL ON public."vehicle_catalog_versions" FROM anon, authenticated;
ALTER TABLE public."vehicle_catalog_versions" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_vehicle_catalog_versions" ON public."vehicle_catalog_versions";
CREATE POLICY "tenant_select_vehicle_catalog_versions" ON public."vehicle_catalog_versions" FOR SELECT TO authenticated
USING (public.is_tenant_member("vehicle_catalog_versions".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_vehicle_catalog_versions" ON public."vehicle_catalog_versions";
CREATE POLICY "tenant_insert_vehicle_catalog_versions" ON public."vehicle_catalog_versions" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("vehicle_catalog_versions".tenant_id));
DROP POLICY IF EXISTS "tenant_update_vehicle_catalog_versions" ON public."vehicle_catalog_versions";
CREATE POLICY "tenant_update_vehicle_catalog_versions" ON public."vehicle_catalog_versions" FOR UPDATE TO authenticated
USING (public.is_tenant_member("vehicle_catalog_versions".tenant_id))
WITH CHECK (public.is_tenant_member("vehicle_catalog_versions".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_vehicle_catalog_versions" ON public."vehicle_catalog_versions";
CREATE POLICY "tenant_delete_vehicle_catalog_versions" ON public."vehicle_catalog_versions" FOR DELETE TO authenticated
USING (public.is_tenant_member("vehicle_catalog_versions".tenant_id));

REVOKE ALL ON public."vin_decode_events" FROM anon, authenticated;
ALTER TABLE public."vin_decode_events" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tenant_select_vin_decode_events" ON public."vin_decode_events";
CREATE POLICY "tenant_select_vin_decode_events" ON public."vin_decode_events" FOR SELECT TO authenticated
USING (public.is_tenant_member("vin_decode_events".tenant_id));
DROP POLICY IF EXISTS "tenant_insert_vin_decode_events" ON public."vin_decode_events";
CREATE POLICY "tenant_insert_vin_decode_events" ON public."vin_decode_events" FOR INSERT TO authenticated
WITH CHECK (public.is_tenant_member("vin_decode_events".tenant_id));
DROP POLICY IF EXISTS "tenant_update_vin_decode_events" ON public."vin_decode_events";
CREATE POLICY "tenant_update_vin_decode_events" ON public."vin_decode_events" FOR UPDATE TO authenticated
USING (public.is_tenant_member("vin_decode_events".tenant_id))
WITH CHECK (public.is_tenant_member("vin_decode_events".tenant_id));
DROP POLICY IF EXISTS "tenant_delete_vin_decode_events" ON public."vin_decode_events";
CREATE POLICY "tenant_delete_vin_decode_events" ON public."vin_decode_events" FOR DELETE TO authenticated
USING (public.is_tenant_member("vin_decode_events".tenant_id));

REVOKE ALL ON public.tenants FROM anon, authenticated;
GRANT SELECT ON public.tenants TO authenticated;
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member_select_tenant" ON public.tenants;
CREATE POLICY "member_select_tenant" ON public.tenants FOR SELECT TO authenticated
USING (public.is_tenant_member(tenants.id));

INSERT INTO storage.buckets (id, name, public) VALUES ('filo-private', 'filo-private', false)
ON CONFLICT (id) DO UPDATE SET public = false;
DROP POLICY IF EXISTS "tenant_read_private_files" ON storage.objects;
DROP POLICY IF EXISTS "tenant_write_private_files" ON storage.objects;
COMMIT;
