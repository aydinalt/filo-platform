CREATE TABLE `production_rollouts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`phase` text NOT NULL,
	`target_percent` integer NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`ended_at` text NOT NULL,
	`duration_minutes` integer NOT NULL,
	`readiness_passed` integer DEFAULT 0 NOT NULL,
	`readiness_total` integer DEFAULT 0 NOT NULL,
	`connected_providers` integer DEFAULT 0 NOT NULL,
	`provider_total` integer DEFAULT 0 NOT NULL,
	`critical_incident_count` integer DEFAULT 0 NOT NULL,
	`pending_outbox_count` integer DEFAULT 0 NOT NULL,
	`stale_telemetry_count` integer DEFAULT 0 NOT NULL,
	`owner_approver` text NOT NULL,
	`operations_approver` text NOT NULL,
	`rollback_plan` text NOT NULL,
	`rollback_triggered` integer DEFAULT 0 NOT NULL,
	`evidence_file_id` text NOT NULL,
	`evidence_sha256` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `production_rollout_tenant_phase_status_idx` ON `production_rollouts` (`tenant_id`,`phase`,`status`,`created_at`);