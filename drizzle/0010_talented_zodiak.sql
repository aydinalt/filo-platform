CREATE TABLE `e2e_acceptance_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`environment` text NOT NULL,
	`base_url` text NOT NULL,
	`runner` text NOT NULL,
	`browser` text NOT NULL,
	`api_total` integer NOT NULL,
	`api_passed` integer NOT NULL,
	`role_total` integer NOT NULL,
	`role_passed` integer NOT NULL,
	`tenant_total` integer NOT NULL,
	`tenant_passed` integer NOT NULL,
	`browser_total` integer NOT NULL,
	`browser_passed` integer NOT NULL,
	`failed_count` integer DEFAULT 0 NOT NULL,
	`status` text NOT NULL,
	`commit_sha` text NOT NULL,
	`evidence_file_id` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`executed_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `e2e_acceptance_tenant_status_idx` ON `e2e_acceptance_runs` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `operations_controls` (
	`id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`owner_team` text NOT NULL,
	`schedule` text NOT NULL,
	`target_minutes` integer NOT NULL,
	`escalation_minutes` integer NOT NULL,
	`retention_days` integer DEFAULT 0 NOT NULL,
	`runbook_url` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE INDEX `operations_control_tenant_kind_idx` ON `operations_controls` (`tenant_id`,`kind`);--> statement-breakpoint
CREATE TABLE `operations_readiness_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`status` text NOT NULL,
	`active_controls` integer NOT NULL,
	`required_controls` integer NOT NULL,
	`open_critical_alerts` integer NOT NULL,
	`restore_age_days` integer NOT NULL,
	`on_call_owner` text NOT NULL,
	`evidence_file_id` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`executed_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `operations_readiness_tenant_status_idx` ON `operations_readiness_runs` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `vehicle_catalog_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`version_id` text NOT NULL,
	`make` text NOT NULL,
	`model` text NOT NULL,
	`year_from` integer NOT NULL,
	`year_to` integer NOT NULL,
	`market` text NOT NULL,
	`body_type` text DEFAULT '' NOT NULL,
	`fuel_type` text DEFAULT '' NOT NULL,
	`external_code` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_catalog_entry_uq` ON `vehicle_catalog_entries` (`tenant_id`,`version_id`,`make`,`model`,`market`,`year_from`);--> statement-breakpoint
CREATE TABLE `vehicle_catalog_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`version` text NOT NULL,
	`source` text NOT NULL,
	`market` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`source_sha256` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_catalog_tenant_version_uq` ON `vehicle_catalog_versions` (`tenant_id`,`version`);--> statement-breakpoint
CREATE TABLE `vin_decode_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`vin` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`make` text DEFAULT '' NOT NULL,
	`model` text DEFAULT '' NOT NULL,
	`model_year` integer DEFAULT 0 NOT NULL,
	`market` text DEFAULT '' NOT NULL,
	`response_digest` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `vin_decode_tenant_vin_idx` ON `vin_decode_events` (`tenant_id`,`vin`,`created_at`);