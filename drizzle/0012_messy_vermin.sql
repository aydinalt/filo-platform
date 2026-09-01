CREATE TABLE `tax_profile_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`version_id` text NOT NULL,
	`country_code` text NOT NULL,
	`region_code` text DEFAULT '' NOT NULL,
	`label` text NOT NULL,
	`currency` text NOT NULL,
	`tax_name` text NOT NULL,
	`rate_bps` integer NOT NULL,
	`category` text NOT NULL,
	`document_types` text DEFAULT '[]' NOT NULL,
	`reverse_charge` integer DEFAULT false NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text,
	`source_url` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_profile_entry_label_uq` ON `tax_profile_entries` (`tenant_id`,`version_id`,`label`);--> statement-breakpoint
CREATE INDEX `tax_profile_lookup_idx` ON `tax_profile_entries` (`tenant_id`,`country_code`,`region_code`,`active`,`effective_from`);--> statement-breakpoint
CREATE TABLE `tax_profile_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`version` text NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`entry_count` integer DEFAULT 0 NOT NULL,
	`source_sha256` text NOT NULL,
	`published_by` text NOT NULL,
	`published_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tax_profile_tenant_version_uq` ON `tax_profile_versions` (`tenant_id`,`version`);