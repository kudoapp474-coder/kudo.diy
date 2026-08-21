import { env } from "kodo-runtime-env";

type D1Result<T = Record<string, unknown>> = { results?: T[] };

export function database() {
  return env.DB as D1Database;
}

export async function ensureDatabase() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, plan TEXT NOT NULL DEFAULT 'free', credits INTEGER NOT NULL DEFAULT 500, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', repository TEXT, branch TEXT NOT NULL DEFAULT 'main', status TEXT NOT NULL DEFAULT 'draft', preview_url TEXT, production_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, user_email TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, result TEXT, steps_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending', input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, credits_used INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS generations_project_idx ON generations(project_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'text', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS project_files_path_idx ON project_files(project_id, path)"),
    db.prepare("CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, generation_id TEXT, label TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS deployments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT NOT NULL, environment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_config_json TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, account_label TEXT, status TEXT NOT NULL DEFAULT 'disconnected', metadata_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS connections_provider_idx ON connections(workspace_id, provider)"),
    db.prepare("CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, generation_id TEXT, kind TEXT NOT NULL, units INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_events (event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL, workspace_id TEXT, payload_json TEXT NOT NULL, processed_at TEXT NOT NULL)"),
  ]);
  return db;
}

export async function all<T>(statement: D1PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>() as D1Result<T>;
  return result.results ?? [];
}

export function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`;
}

export function now() {
  return new Date().toISOString();
}
