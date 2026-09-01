CREATE TABLE `mobile_releases` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`platform` text NOT NULL,
	`version` text NOT NULL,
	`build_number` text NOT NULL,
	`bundle_id` text NOT NULL,
	`store_status` text NOT NULL,
	`store_review_id` text NOT NULL,
	`signing_status` text NOT NULL,
	`background_location_status` text NOT NULL,
	`data_safety_status` text NOT NULL,
	`privacy_url` text NOT NULL,
	`support_url` text NOT NULL,
	`account_deletion_url` text NOT NULL,
	`rollback_plan` text NOT NULL,
	`evidence_file_id` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `mobile_releases_tenant_platform_status_idx` ON `mobile_releases` (`tenant_id`,`platform`,`store_status`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`status` text NOT NULL,
	`company_count` integer NOT NULL,
	`vehicle_count` integer NOT NULL,
	`customer_approver` text NOT NULL,
	`platform_approver` text NOT NULL,
	`customer_approved_at` text,
	`platform_approved_at` text,
	`evidence_file_id` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `pilot_runs_tenant_status_idx` ON `pilot_runs` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `pilot_scenarios` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`pilot_run_id` text NOT NULL,
	`code` text NOT NULL,
	`expected_result` text NOT NULL,
	`actual_result` text NOT NULL,
	`status` text NOT NULL,
	`blocker_severity` text DEFAULT 'NONE' NOT NULL,
	`executed_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pilot_scenario_run_code_uq` ON `pilot_scenarios` (`pilot_run_id`,`code`);--> statement-breakpoint
CREATE TABLE `security_findings` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`run_id` text NOT NULL,
	`severity` text NOT NULL,
	`title` text NOT NULL,
	`status` text DEFAULT 'OPEN' NOT NULL,
	`owner` text NOT NULL,
	`remediation` text DEFAULT '' NOT NULL,
	`due_date` text DEFAULT '' NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_findings_tenant_status_idx` ON `security_findings` (`tenant_id`,`status`,`severity`);--> statement-breakpoint
CREATE TABLE `security_test_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`tool` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`concurrency` integer DEFAULT 0 NOT NULL,
	`p95_ms` integer DEFAULT 0 NOT NULL,
	`p99_ms` integer DEFAULT 0 NOT NULL,
	`error_rate_bps` integer DEFAULT 0 NOT NULL,
	`critical_count` integer DEFAULT 0 NOT NULL,
	`high_count` integer DEFAULT 0 NOT NULL,
	`external_auditor` text NOT NULL,
	`report_file_id` text NOT NULL,
	`report_sha256` text NOT NULL,
	`executed_at` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `security_test_runs_tenant_status_idx` ON `security_test_runs` (`tenant_id`,`status`,`created_at`);