CREATE TABLE `audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`actor_email` text NOT NULL,
	`action` text NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `file_objects` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`module` text NOT NULL,
	`record_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`content_type` text NOT NULL,
	`size` integer NOT NULL,
	`sha256` text NOT NULL,
	`uploaded_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_objects_object_key_unique` ON `file_objects` (`object_key`);--> statement-breakpoint
CREATE TABLE `module_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`module` text NOT NULL,
	`status` text DEFAULT 'TASLAK' NOT NULL,
	`data` text DEFAULT '{}' NOT NULL,
	`version` integer DEFAULT 1 NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`created_by` text NOT NULL,
	`updated_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `module_records_tenant_module_id_uq` ON `module_records` (`tenant_id`,`module`,`id`);--> statement-breakpoint
CREATE TABLE `outbox_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`topic` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE TABLE `record_links` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`from_module` text NOT NULL,
	`from_id` text NOT NULL,
	`to_module` text NOT NULL,
	`to_id` text NOT NULL,
	`relation` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`tenant_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_by` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `key`)
);
--> statement-breakpoint
CREATE TABLE `support_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`requester_email` text NOT NULL,
	`module` text NOT NULL,
	`page_area` text NOT NULL,
	`type` text NOT NULL,
	`priority` text NOT NULL,
	`description` text NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`manager` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `teams_tenant_name_uq` ON `teams` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `telemetry_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`device_id` text NOT NULL,
	`latitude` text NOT NULL,
	`longitude` text NOT NULL,
	`speed` integer DEFAULT 0 NOT NULL,
	`battery` integer DEFAULT 0 NOT NULL,
	`captured_at` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tenant_members` (
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`role` text DEFAULT 'Viewer' NOT NULL,
	`team` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`invite_status` text DEFAULT 'ACTIVE' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `email`)
);
--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text DEFAULT 'TR' NOT NULL,
	`default_currency` text DEFAULT 'TRY' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
