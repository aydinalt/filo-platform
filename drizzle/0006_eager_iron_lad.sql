CREATE TABLE `migration_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`module` text NOT NULL,
	`source_sha256` text NOT NULL,
	`status` text DEFAULT 'COMMITTED' NOT NULL,
	`total` integer NOT NULL,
	`imported` integer NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`duplicates` integer DEFAULT 0 NOT NULL,
	`record_ids` text DEFAULT '[]' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`rolled_back_at` text
);
--> statement-breakpoint
CREATE INDEX `migration_runs_tenant_status_idx` ON `migration_runs` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `monitoring_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`source` text NOT NULL,
	`signal` text NOT NULL,
	`severity` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`assigned_team` text NOT NULL,
	`detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`acknowledged_at` text,
	`resolved_at` text
);
--> statement-breakpoint
CREATE INDEX `monitoring_events_tenant_status_idx` ON `monitoring_events` (`tenant_id`,`status`,`detected_at`);--> statement-breakpoint
CREATE TABLE `restore_rehearsals` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`backup_sha256` text NOT NULL,
	`source_exported_at` text NOT NULL,
	`status` text DEFAULT 'RUNNING' NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`file_count` integer DEFAULT 0 NOT NULL,
	`rpo_minutes` integer DEFAULT 0 NOT NULL,
	`rto_seconds` integer DEFAULT 0 NOT NULL,
	`target_namespace` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `restore_rehearsals_tenant_status_idx` ON `restore_rehearsals` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `restore_staging_records` (
	`rehearsal_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`kind` text NOT NULL,
	`source_key` text NOT NULL,
	`payload_sha256` text NOT NULL,
	PRIMARY KEY(`rehearsal_id`, `kind`, `source_key`)
);
--> statement-breakpoint
ALTER TABLE `legal_profiles` ADD `legal_opinion_reference` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `legal_profiles` ADD `policy_version` text DEFAULT '' NOT NULL;