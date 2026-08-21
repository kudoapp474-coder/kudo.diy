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
    db.prepare("CREATE TABLE IF NOT EXISTS project_files (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, language TEXT NOT NULL DEFAULT 'text', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS project_files_path_idx ON project_files(project_id, path)"),
    db.prepare("CREATE TABLE IF NOT EXISTS versions (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, generation_id TEXT, label TEXT NOT NULL, snapshot_json TEXT NOT NULL, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS deployments (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version_id TEXT NOT NULL, environment TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', url TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT NOT NULL, trigger_type TEXT NOT NULL, trigger_config_json TEXT NOT NULL DEFAULT '{}', active INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS connections (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, provider TEXT NOT NULL, account_label TEXT, status TEXT NOT NULL DEFAULT 'disconnected', metadata_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS connections_provider_idx ON connections(workspace_id, provider)"),
    db.prepare("CREATE TABLE IF NOT EXISTS usage_events (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, generation_id TEXT, kind TEXT NOT NULL, units INTEGER NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_events (event_id TEXT PRIMARY KEY, provider TEXT NOT NULL, event_type TEXT NOT NULL, workspace_id TEXT, payload_json TEXT NOT NULL, processed_at TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS billing_subscriptions (workspace_id TEXT PRIMARY KEY, provider TEXT NOT NULL, subscription_id TEXT NOT NULL, customer_id TEXT, product_id TEXT, status TEXT NOT NULL, next_billing_date TEXT, cancel_at_next_billing_date INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL)"),
  ]);
  return db;
}

export async function all<T>(statement: PreparedStatement): Promise<T[]> {
  const result = await statement.all<T>();
  return result.results ?? [];
}

export function id(prefix: string) { return `${prefix}_${crypto.randomUUID().replaceAll("-", "").slice(0, 20)}`; }
export function now() { return new Date().toISOString(); }
