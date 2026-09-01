CREATE TABLE `provider_callback_events` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`provider` text NOT NULL,
	`external_event_id` text NOT NULL,
	`payload_sha256` text NOT NULL,
	`status` text DEFAULT 'RECEIVED' NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_callback_event_uq` ON `provider_callback_events` (`provider`,`external_event_id`);--> statement-breakpoint
CREATE INDEX `provider_callback_tenant_received_idx` ON `provider_callback_events` (`tenant_id`,`received_at`);