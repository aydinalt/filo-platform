CREATE TABLE `scheduled_job_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`job_name` text NOT NULL,
	`slot` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempt` integer DEFAULT 0 NOT NULL,
	`started_at` text,
	`completed_at` text,
	`result` text DEFAULT '{}' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_job_tenant_slot_uq` ON `scheduled_job_runs` (`tenant_id`,`job_name`,`slot`);--> statement-breakpoint
CREATE INDEX `scheduled_job_status_idx` ON `scheduled_job_runs` (`status`,`updated_at`);