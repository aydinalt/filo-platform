CREATE TABLE `consent_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`document_key` text NOT NULL,
	`document_version` text NOT NULL,
	`locale` text DEFAULT 'tr-TR' NOT NULL,
	`evidence` text DEFAULT '{}' NOT NULL,
	`accepted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consent_actor_document_uq` ON `consent_events` (`tenant_id`,`actor_email`,`document_key`,`document_version`);--> statement-breakpoint
CREATE TABLE `device_ingest_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `device_ingest_token_hash_uq` ON `device_ingest_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `device_ingest_tenant_device_idx` ON `device_ingest_tokens` (`tenant_id`,`device_id`);--> statement-breakpoint
CREATE TABLE `provider_connections` (
	`tenant_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`status` text DEFAULT 'CONFIG_REQUIRED' NOT NULL,
	`last_check_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `provider`)
);
--> statement-breakpoint
CREATE TABLE `signature_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`custody_record_id` text NOT NULL,
	`method` text NOT NULL,
	`provider` text DEFAULT 'MANUAL' NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`document_digest` text DEFAULT '' NOT NULL,
	`evidence_file_id` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `signature_custody_uq` ON `signature_requests` (`tenant_id`,`custody_record_id`);--> statement-breakpoint
CREATE TABLE `subscription_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`plan` text NOT NULL,
	`period` text NOT NULL,
	`seats` integer NOT NULL,
	`vehicles` integer NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`status` text DEFAULT 'PAYMENT_PROVIDER_REQUIRED' NOT NULL,
	`provider_reference` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `subscription_orders_tenant_status_idx` ON `subscription_orders` (`tenant_id`,`status`);--> statement-breakpoint
ALTER TABLE `outbox_events` ADD `last_error` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `outbox_tenant_status_idx` ON `outbox_events` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `audit_events_tenant_created_idx` ON `audit_events` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `module_records_tenant_module_status_idx` ON `module_records` (`tenant_id`,`module`,`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `record_links_relation_uq` ON `record_links` (`tenant_id`,`from_module`,`from_id`,`to_module`,`to_id`,`relation`);--> statement-breakpoint
CREATE UNIQUE INDEX `telemetry_dedupe_uq` ON `telemetry_events` (`tenant_id`,`device_id`,`captured_at`);--> statement-breakpoint
CREATE INDEX `telemetry_vehicle_time_idx` ON `telemetry_events` (`tenant_id`,`vehicle_id`,`captured_at`);