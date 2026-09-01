CREATE TABLE `mobile_installations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`platform` text NOT NULL,
	`os_version` text NOT NULL,
	`app_version` text NOT NULL,
	`device_model` text DEFAULT '' NOT NULL,
	`foreground_permission` text DEFAULT 'UNKNOWN' NOT NULL,
	`background_permission` text DEFAULT 'UNKNOWN' NOT NULL,
	`foreground_service` text DEFAULT 'NOT_APPLICABLE' NOT NULL,
	`battery_optimization` text DEFAULT 'UNKNOWN' NOT NULL,
	`notification_permission` text DEFAULT 'UNKNOWN' NOT NULL,
	`status` text DEFAULT 'REGISTERED' NOT NULL,
	`last_heartbeat_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mobile_installation_device_uq` ON `mobile_installations` (`tenant_id`,`device_id`);--> statement-breakpoint
CREATE INDEX `mobile_installation_tenant_status_idx` ON `mobile_installations` (`tenant_id`,`status`);--> statement-breakpoint
CREATE TABLE `tracker_gateway_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`provider` text NOT NULL,
	`protocol` text NOT NULL,
	`external_message_id` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracker_gateway_message_uq` ON `tracker_gateway_events` (`tenant_id`,`device_id`,`external_message_id`);--> statement-breakpoint
CREATE INDEX `tracker_gateway_tenant_received_idx` ON `tracker_gateway_events` (`tenant_id`,`received_at`);--> statement-breakpoint
CREATE TABLE `tracking_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`device_id` text NOT NULL,
	`vehicle_id` text NOT NULL,
	`driver_id` text NOT NULL,
	`source` text NOT NULL,
	`provider` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`permission_snapshot` text DEFAULT '{}' NOT NULL,
	`started_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text,
	`ended_at` text
);
--> statement-breakpoint
CREATE INDEX `tracking_session_tenant_status_idx` ON `tracking_sessions` (`tenant_id`,`status`,`started_at`);--> statement-breakpoint
CREATE INDEX `tracking_session_device_status_idx` ON `tracking_sessions` (`tenant_id`,`device_id`,`status`);--> statement-breakpoint
ALTER TABLE `device_ingest_tokens` ADD `provider` text DEFAULT 'MOBILE' NOT NULL;--> statement-breakpoint
ALTER TABLE `device_ingest_tokens` ADD `protocol` text DEFAULT 'HTTPS_JSON_V1' NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `source` text DEFAULT 'BROWSER' NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `provider` text DEFAULT 'FILO' NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `event_type` text DEFAULT 'LOCATION' NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `sequence` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `accuracy` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `altitude` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `heading` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `telemetry_events` ADD `session_id` text DEFAULT '' NOT NULL;