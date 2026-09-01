CREATE TABLE `hardware_device_assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`imei` text NOT NULL,
	`iccid` text NOT NULL,
	`provider` text NOT NULL,
	`model_code` text NOT NULL,
	`protocol` text NOT NULL,
	`transport` text DEFAULT 'TCP_MQTT_HTTPS' NOT NULL,
	`status` text DEFAULT 'PROVISIONED' NOT NULL,
	`firmware_version` text DEFAULT '' NOT NULL,
	`assigned_by` text NOT NULL,
	`assigned_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`revoked_at` text,
	`last_gateway_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_assignment_tenant_imei_uq` ON `hardware_device_assignments` (`tenant_id`,`imei`);--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_assignment_tenant_device_uq` ON `hardware_device_assignments` (`tenant_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `hardware_assignment_tenant_vehicle_status_idx` ON `hardware_device_assignments` (`tenant_id`,`vehicle_id`,`status`);--> statement-breakpoint
CREATE INDEX `hardware_assignment_tenant_status_idx` ON `hardware_device_assignments` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `hardware_sim_cards` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`iccid` text NOT NULL,
	`msisdn` text DEFAULT '' NOT NULL,
	`operator` text DEFAULT '' NOT NULL,
	`apn` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'STOCK' NOT NULL,
	`activated_at` text,
	`suspended_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `hardware_sim_tenant_iccid_uq` ON `hardware_sim_cards` (`tenant_id`,`iccid`);--> statement-breakpoint
CREATE INDEX `hardware_sim_tenant_status_idx` ON `hardware_sim_cards` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `mobile_runtime_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`session_id` text NOT NULL,
	`event_type` text NOT NULL,
	`sequence` integer NOT NULL,
	`battery_percent` integer DEFAULT -1 NOT NULL,
	`queue_depth` integer DEFAULT 0 NOT NULL,
	`network_type` text DEFAULT 'UNKNOWN' NOT NULL,
	`app_state` text DEFAULT 'UNKNOWN' NOT NULL,
	`details` text DEFAULT '{}' NOT NULL,
	`occurred_at` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_runtime_event_dedupe_uq` ON `mobile_runtime_events` (`tenant_id`,`device_id`,`id`);--> statement-breakpoint
CREATE INDEX `mobile_runtime_session_time_idx` ON `mobile_runtime_events` (`tenant_id`,`session_id`,`occurred_at`);--> statement-breakpoint
CREATE INDEX `mobile_runtime_type_time_idx` ON `mobile_runtime_events` (`tenant_id`,`event_type`,`occurred_at`);--> statement-breakpoint
ALTER TABLE `field_validation_runs` ADD `runtime_event_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `field_validation_runs` ADD `offline_queue_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `field_validation_runs` ADD `flushed_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `field_validation_runs` ADD `late_telemetry_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `field_validation_runs` ADD `battery_sample_count` integer DEFAULT 0 NOT NULL;