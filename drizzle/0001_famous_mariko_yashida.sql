CREATE UNIQUE INDEX `connections_provider_idx` ON `connections` (`workspace_id`,`provider`);--> statement-breakpoint
CREATE INDEX `generations_project_idx` ON `generations` (`project_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `project_files_path_idx` ON `project_files` (`project_id`,`path`);--> statement-breakpoint
CREATE INDEX `projects_workspace_idx` ON `projects` (`workspace_id`,`updated_at`);