import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  plan: text("plan").notNull().default("free"),
  credits: integer("credits").notNull().default(500),
  createdAt: text("created_at").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  repository: text("repository"),
  branch: text("branch").notNull().default("main"),
  status: text("status").notNull().default("draft"),
  previewUrl: text("preview_url"),
  productionUrl: text("production_url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("projects_workspace_idx").on(table.workspaceId, table.updatedAt)]);

export const generations = sqliteTable("generations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  userEmail: text("user_email").notNull(),
  model: text("model").notNull(),
  prompt: text("prompt").notNull(),
  result: text("result"),
  stepsJson: text("steps_json").notNull().default("[]"),
  status: text("status").notNull().default("pending"),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  creditsUsed: integer("credits_used").notNull().default(0),
  error: text("error"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [index("generations_project_idx").on(table.projectId, table.createdAt)]);

export const projectFiles = sqliteTable("project_files", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  path: text("path").notNull(),
  content: text("content").notNull(),
  language: text("language").notNull().default("text"),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("project_files_path_idx").on(table.projectId, table.path)]);

export const versions = sqliteTable("versions", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  generationId: text("generation_id"),
  label: text("label").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  createdAt: text("created_at").notNull(),
});

export const deployments = sqliteTable("deployments", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  versionId: text("version_id").notNull(),
  environment: text("environment").notNull(),
  status: text("status").notNull().default("queued"),
  url: text("url"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectDomains = sqliteTable("project_domains", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  domain: text("domain").notNull(),
  status: text("status").notNull().default("pending"),
  verificationJson: text("verification_json").notNull().default("[]"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("project_domains_name_idx").on(table.projectId, table.domain)]);

export const projectSecrets = sqliteTable("project_secrets", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  keyName: text("key_name").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  targetsJson: text("targets_json").notNull().default("[]"),
  gitBranch: text("git_branch"),
  syncStatus: text("sync_status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("project_secrets_key_idx").on(table.projectId, table.keyName)]);

export const projectDatabases = sqliteTable("project_databases", {
  projectId: text("project_id").primaryKey(),
  provider: text("provider").notNull(),
  envKey: text("env_key").notNull(),
  encryptedValue: text("encrypted_value").notNull(),
  targetsJson: text("targets_json").notNull().default("[]"),
  syncStatus: text("sync_status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const projectAuditEvents = sqliteTable("project_audit_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  userEmail: text("user_email").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
}, table => [index("project_audit_events_project_idx").on(table.projectId, table.createdAt)]);

export const automations = sqliteTable("automations", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  name: text("name").notNull(),
  prompt: text("prompt").notNull(),
  triggerType: text("trigger_type").notNull(),
  triggerConfigJson: text("trigger_config_json").notNull().default("{}"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  lastRunAt: text("last_run_at"),
  createdAt: text("created_at").notNull(),
});

export const connections = sqliteTable("connections", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  provider: text("provider").notNull(),
  accountLabel: text("account_label"),
  status: text("status").notNull().default("disconnected"),
  metadataJson: text("metadata_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull(),
}, table => [uniqueIndex("connections_provider_idx").on(table.workspaceId, table.provider)]);

export const usageEvents = sqliteTable("usage_events", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  generationId: text("generation_id"),
  kind: text("kind").notNull(),
  units: integer("units").notNull(),
  metadataJson: text("metadata_json").notNull().default("{}"),
  createdAt: text("created_at").notNull(),
});


export const creditAdjustments = sqliteTable("credit_adjustments", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  adminEmail: text("admin_email").notNull(),
  delta: integer("delta").notNull(),
  reason: text("reason").notNull(),
  previousBalance: integer("previous_balance").notNull(),
  newBalance: integer("new_balance").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  completedAt: text("completed_at"),
}, table => [index("credit_adjustments_workspace_idx").on(table.workspaceId, table.createdAt)]);
