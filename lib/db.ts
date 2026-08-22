import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { env } from "kodo-runtime-env";

type QueryResult<T = Record<string, unknown>> = { results?: T[] };
type RunResult = { meta?: { changes?: number } };

export interface PreparedStatement {
  bind(...values: unknown[]): PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<QueryResult<T>>;
  run(): Promise<RunResult>;
}

export interface KodoDatabase {
  prepare(query: string): PreparedStatement;
  batch(statements: PreparedStatement[]): Promise<unknown[]>;
}

type FullNeon = NeonQueryFunction<false, true>;

class NeonStatement implements PreparedStatement {
  private values: unknown[] = [];
  constructor(private readonly sql: FullNeon, private readonly query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  private async execute<T>() {
    const result = await this.sql.query(normalizeSql(this.query), this.values);
    return { rows: result.rows as T[], changes: result.rowCount ?? 0 };
  }
  async first<T>() { const result = await this.execute<T>(); return result.rows[0] ?? null; }
  async all<T>() { const result = await this.execute<T>(); return { results: result.rows }; }
  async run() { const result = await this.execute(); return { meta: { changes: result.changes } }; }
}

class NeonDatabase implements KodoDatabase {
  constructor(private readonly sql: FullNeon) {}
  prepare(query: string) { return new NeonStatement(this.sql, query); }
  async batch(statements: PreparedStatement[]) {
    const results: unknown[] = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

let neonDatabase: KodoDatabase | null = null;

export function database(): KodoDatabase {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    if (!neonDatabase) neonDatabase = new NeonDatabase(neon(connectionString, { fullResults: true }));
    return neonDatabase;
  }
  if (env.DB) return env.DB as unknown as KodoDatabase;
  throw new Error("Database is not configured. Connect Neon or provide the Cloudflare D1 binding.");
}

function normalizeSql(query: string) {
  const ignoredInsert = /INSERT\s+OR\s+IGNORE\s+INTO/i.test(query);
  let normalized = query
    .replace(/INSERT\s+OR\s+IGNORE\s+INTO/gi, "INSERT INTO")
    .replace(/\bMAX\s*\(/gi, "GREATEST(");
  let parameter = 0;
  normalized = normalized.replace(/\?/g, () => `$${++parameter}`);
  if (ignoredInsert && !/ON\s+CONFLICT/i.test(normalized)) normalized = `${normalized.replace(/;\s*$/, "")} ON CONFLICT DO NOTHING`;
  return normalized;
}

export async function ensureDatabase() {
  const db = database();
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, owner_email TEXT NOT NULL, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE, plan TEXT NOT NULL DEFAULT 'free', credits INTEGER NOT NULL DEFAULT 500, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', repository TEXT, branch TEXT NOT NULL DEFAULT 'main', status TEXT NOT NULL DEFAULT 'draft', preview_url TEXT, production_url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS projects_workspace_idx ON projects(workspace_id, updated_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS generations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT NOT NULL, user_email TEXT NOT NULL, model TEXT NOT NULL, prompt TEXT NOT NULL, result TEXT, steps_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'pending', input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0, credits_used INTEGER NOT NULL DEFAULT 0, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS generations_project_idx ON generations(project_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS agent_run_locks (workspace_id TEXT PRIMARY KEY, generation_id TEXT NOT NULL, acquired_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'text', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS project_files_path_idx ON project_files(project_id, path)"),
    db.prepare("CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, generation_id TEXT, label TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS deployments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT NOT NULL, environment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_domains (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, domain TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending', verification_json TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS project_domains_name_idx ON project_domains(project_id, domain)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_secrets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, key_name TEXT NOT NULL, encrypted_value TEXT NOT NULL, targets_json TEXT NOT NULL DEFAULT '[]', git_branch TEXT, sync_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS project_secrets_key_idx ON project_secrets(project_id, key_name)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_databases (project_id TEXT PRIMARY KEY, provider TEXT NOT NULL, env_key TEXT NOT NULL, encrypted_value TEXT NOT NULL, targets_json TEXT NOT NULL DEFAULT '[]', sync_status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS project_audit_events (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, user_email TEXT NOT NULL, action TEXT NOT NULL, resource_type TEXT NOT NULL, resource_id TEXT, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS project_audit_events_project_idx ON project_audit_events(project_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS github_syncs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, repository TEXT NOT NULL, branch TEXT NOT NULL, commit_sha TEXT, status TEXT NOT NULL DEFAULT 'syncing', url TEXT, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS github_syncs_project_idx ON github_syncs(project_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, project_id TEXT, name TEXT NOT NULL, prompt TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_config_json TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS automation_runs (id TEXT PRIMARY KEY, automation_id TEXT NOT NULL, workspace_id TEXT NOT NULL, generation_id TEXT, trigger TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'running', error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE INDEX IF NOT EXISTS automation_runs_automation_idx ON automation_runs(automation_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, account_label TEXT, status TEXT NOT NULL DEFAULT 'disconnected', metadata_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS connections_provider_idx ON connections(workspace_id, provider)"),
    db.prepare("CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, generation_id TEXT, kind TEXT NOT NULL, units INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_events (event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL, workspace_id TEXT, payload_json TEXT NOT NULL, processed_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_subscriptions (workspace_id TEXT PRIMARY KEY, provider TEXT NOT NULL, subscription_id TEXT NOT NULL, customer_id TEXT, product_id TEXT, status TEXT NOT NULL, next_billing_date TEXT, cancel_at_next_billing_date INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS credit_adjustments (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, admin_email TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, previous_balance INTEGER NOT NULL, new_balance INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', created_at TEXT NOT NULL, completed_at TEXT)"),
    db.prepare("CREATE INDEX IF NOT EXISTS credit_adjustments_workspace_idx ON credit_adjustments(workspace_id, created_at)"),
    db.prepare("CREATE TABLE IF NOT EXISTS workspace_settings (workspace_id TEXT PRIMARY KEY, permissions_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS workspace_members (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, email TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'member', status TEXT NOT NULL DEFAULT 'invited', invited_by TEXT NOT NULL, invite_token TEXT, created_at TEXT NOT NULL, joined_at TEXT)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_email_idx ON workspace_members(workspace_id, email)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS workspace_members_token_idx ON workspace_members(invite_token)"),
  ]);
  try { await db.prepare("ALTER TABLE automations ADD COLUMN project_id TEXT").run(); } catch { /* already migrated */ }
  try { await db.prepare("ALTER TABLE generations ADD COLUMN cancel_requested_at TEXT").run(); } catch { /* already migrated */ }
  try { await db.prepare("ALTER TABLE generations ADD COLUMN resumed_from TEXT").run(); } catch { /* already migrated */ }
  try { await db.prepare("ALTER TABLE github_syncs ADD COLUMN pr_number INTEGER").run(); } catch { /* already migrated */ }
  try { await db.prepare("ALTER TABLE github_syncs ADD COLUMN pr_url TEXT").run(); } catch { /* already migrated */ }
  try { await db.prepare("ALTER TABLE github_syncs ADD COLUMN pr_state TEXT").run(); } catch { /* already migrated */ }
  return db;
}

export async function all<T>(statement: PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}

export function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`; }
export function now() { return new Date().toISOString(); }
