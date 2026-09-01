CREATE TABLE `legal_profiles` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`controller_name` text DEFAULT '' NOT NULL,
	`tax_id` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`contact_email` text DEFAULT '' NOT NULL,
	`dpo_contact` text DEFAULT '' NOT NULL,
	`jurisdictions` text DEFAULT '' NOT NULL,
	`employee_legal_basis` text DEFAULT '' NOT NULL,
	`location_purposes` text DEFAULT '' NOT NULL,
	`retention_days` integer DEFAULT 0 NOT NULL,
	`periodic_destruction_months` integer DEFAULT 0 NOT NULL,
	`subprocessors` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'LEGAL_REVIEW_REQUIRED' NOT NULL,
	`approved_by` text DEFAULT '' NOT NULL,
	`approved_at` text DEFAULT '' NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rate_limit_windows` (
	`scope` text NOT NULL,
	`key_hash` text NOT NULL,
	`window_start` integer NOT NULL,
	`hits` integer DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`scope`, `key_hash`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `rate_limit_window_idx` ON `rate_limit_windows` (`window_start`);--> statement-breakpoint
ALTER TABLE `file_objects` ADD `scan_status` text DEFAULT 'PENDING_RESCAN' NOT NULL;--> statement-breakpoint
ALTER TABLE `file_objects` ADD `scan_engine` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `file_objects` ADD `scan_summary` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TRIGGER `audit_events_block_update` BEFORE UPDATE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events are append-only');
END;
--> statement-breakpoint
CREATE TRIGGER `audit_events_block_delete` BEFORE DELETE ON `audit_events`
BEGIN
	SELECT RAISE(ABORT, 'audit_events are append-only');
END;
