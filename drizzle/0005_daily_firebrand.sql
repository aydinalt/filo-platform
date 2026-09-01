CREATE TABLE `e_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`source_module` text NOT NULL,
	`source_record_id` text NOT NULL,
	`document_type` text NOT NULL,
	`currency` text NOT NULL,
	`net_minor` integer NOT NULL,
	`tax_minor` integer NOT NULL,
	`gross_minor` integer NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`provider_reference` text DEFAULT '' NOT NULL,
	`failure_code` text DEFAULT '' NOT NULL,
	`issued_at` text,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `e_document_source_uq` ON `e_documents` (`tenant_id`,`source_module`,`source_record_id`);--> statement-breakpoint
CREATE INDEX `e_document_status_idx` ON `e_documents` (`tenant_id`,`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `notification_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`outbox_event_id` text NOT NULL,
	`channel` text NOT NULL,
	`recipient` text NOT NULL,
	`template_key` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`provider_reference` text DEFAULT '' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`sent_at` text,
	`delivered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_delivery_target_uq` ON `notification_deliveries` (`tenant_id`,`outbox_event_id`,`channel`,`recipient`);--> statement-breakpoint
CREATE INDEX `notification_delivery_status_idx` ON `notification_deliveries` (`tenant_id`,`status`,`next_attempt_at`);--> statement-breakpoint
CREATE TABLE `provider_dispatches` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`record_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`request_sha256` text NOT NULL,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`provider_reference` text DEFAULT '' NOT NULL,
	`response_code` integer DEFAULT 0 NOT NULL,
	`next_attempt_at` text,
	`last_error` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `provider_dispatch_idempotency_uq` ON `provider_dispatches` (`tenant_id`,`provider`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `provider_dispatch_status_idx` ON `provider_dispatches` (`tenant_id`,`provider`,`status`,`next_attempt_at`);--> statement-breakpoint
ALTER TABLE `mobile_installations` ADD `push_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `mobile_installations` ADD `push_token_status` text DEFAULT 'UNREGISTERED' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_orders` ADD `checkout_url` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_orders` ADD `idempotency_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `subscription_orders` ADD `failure_code` text DEFAULT '' NOT NULL;