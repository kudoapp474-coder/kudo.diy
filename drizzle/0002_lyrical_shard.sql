CREATE TABLE IF NOT EXISTS `credit_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`admin_email` text NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`previous_balance` integer NOT NULL,
	`new_balance` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `credit_adjustments_workspace_idx` ON `credit_adjustments` (`workspace_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_audit_events` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`user_email` text NOT NULL,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `project_audit_events_project_idx` ON `project_audit_events` (`project_id`,`created_at`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_databases` (
	`project_id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`env_key` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`targets_json` text DEFAULT '[]' NOT NULL,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_domains` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`domain` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`verification_json` text DEFAULT '[]' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `project_domains_name_idx` ON `project_domains` (`project_id`,`domain`);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `project_secrets` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`key_name` text NOT NULL,
	`encrypted_value` text NOT NULL,
	`targets_json` text DEFAULT '[]' NOT NULL,
	`git_branch` text,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `project_secrets_key_idx` ON `project_secrets` (`project_id`,`key_name`);
