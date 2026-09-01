ALTER TABLE `monitoring_events` ADD `assigned_owner` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `fingerprint` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `occurrence_count` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `first_detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `last_detected_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `acknowledge_due_at` text;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `escalation_due_at` text;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `escalation_level` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `runbook_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `monitoring_events` ADD `resolution_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `monitoring_events_open_fingerprint_uq` ON `monitoring_events` (`tenant_id`,`fingerprint`) WHERE `status` <> 'RESOLVED' AND `fingerprint` <> '';--> statement-breakpoint
CREATE TABLE `operational_health_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`status` text NOT NULL,
	`application_error_count` integer DEFAULT 0 NOT NULL,
	`stale_telemetry_count` integer DEFAULT 0 NOT NULL,
	`failed_webhook_count` integer DEFAULT 0 NOT NULL,
	`failed_cron_count` integer DEFAULT 0 NOT NULL,
	`database_capacity_percent` integer DEFAULT -1 NOT NULL,
	`storage_capacity_percent` integer DEFAULT -1 NOT NULL,
	`unavailable_provider_count` integer DEFAULT 0 NOT NULL,
	`open_critical_count` integer DEFAULT 0 NOT NULL,
	`metrics_source` text DEFAULT 'INTERNAL' NOT NULL,
	`checked_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX `operational_health_tenant_time_idx` ON `operational_health_snapshots` (`tenant_id`,`checked_at`);--> statement-breakpoint
CREATE TABLE `monitoring_escalations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`monitoring_event_id` text NOT NULL,
	`level` integer NOT NULL,
	`from_team` text NOT NULL,
	`to_team` text NOT NULL,
	`reason` text NOT NULL,
	`channel` text DEFAULT 'IN_APP' NOT NULL,
	`delivery_status` text DEFAULT 'RECORDED' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);--> statement-breakpoint
CREATE INDEX `monitoring_escalation_event_idx` ON `monitoring_escalations` (`tenant_id`,`monitoring_event_id`,`created_at`);
