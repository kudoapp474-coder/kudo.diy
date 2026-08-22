import { all, id, now } from "../../../../../lib/db";
import { nativeSandboxConfigured } from "../../../../../lib/vercel-sandbox";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";
import { encryptProjectSecret, normalizeSecretKey, normalizeTargets, projectSecretsConfigured } from "../../../../../lib/project-secrets";
import { addProjectDomain, kodoVercelProjectName, listProjectDomains, projectVercelConfigured, removeProjectDomain, removeProjectEnvironmentVariable, upsertProjectEnvironmentVariable } from "../../../../../lib/vercel-project-config";

type ProjectRow = { id: string; name: string; repository: string | null; branch: string; status: string; preview_url: string | null; production_url: string | null };
type SecretRow = { id: string; key_name: string; targets_json: string; git_branch: string | null; sync_status: string; created_at: string; updated_at: string };
type DatabaseRow = { provider: string; env_key: string; targets_json: string; sync_status: string; created_at: string; updated_at: string };

function parseStringArray(value: string) {
  try { const parsed = JSON.parse(value) as unknown; return Array.isArray(parsed) ? parsed.filter(item => typeof item === "string") : []; } catch { return []; }
}

function normalizeDomain(value: string) {
  const domain = value.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/\.$/, "");
  if (domain.length > 253 || !/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(domain)) throw new Error("Enter a valid domain such as example.com.");
  return domain;
}

function validateDatabase(provider: string, value: string) {
  const allowed: Record<string, { key: string; protocols: string[] }> = {
    neon: { key: "DATABASE_URL", protocols: ["postgres:", "postgresql:"] },
    supabase: { key: "DATABASE_URL", protocols: ["postgres:", "postgresql:"] },
    mongodb: { key: "MONGODB_URI", protocols: ["mongodb:", "mongodb+srv:"] },
    upstash: { key: "UPSTASH_REDIS_REST_URL", protocols: ["https:"] },
    turso: { key: "TURSO_DATABASE_URL", protocols: ["libsql:", "https:"] },
  };
  const config = allowed[provider];
  if (!config) throw new Error("Choose a supported database provider.");
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error("Enter a valid database connection URL."); }
  if (!config.protocols.includes(parsed.protocol) || !parsed.hostname) throw new Error(`This connection URL is not valid for ${provider}.`);
  return config.key;
}

async function projectFor(auth: NonNullable<Awaited<ReturnType<typeof requireApiUser>>>, projectId: string) {
  return auth.db.prepare("SELECT id, name, repository, branch, status, preview_url, production_url FROM projects WHERE id = ? AND workspace_id = ?")
    .bind(projectId, auth.workspaceId).first<ProjectRow>();
}

async function audit(auth: NonNullable<Awaited<ReturnType<typeof requireApiUser>>>, projectId: string, action: string, resourceType: string, resourceId?: string | null, metadata: Record<string, unknown> = {}) {
  await auth.db.prepare("INSERT INTO project_audit_events (id, project_id, user_email, action, resource_type, resource_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(id("aud"), projectId, auth.user.email, action, resourceType, resourceId ?? null, JSON.stringify(metadata), now()).run();
}

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await projectFor(auth, projectId);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const [secrets, database, deployments, github, audits, storedDomains] = await Promise.all([
    all<SecretRow>(auth.db.prepare("SELECT id, key_name, targets_json, git_branch, sync_status, created_at, updated_at FROM project_secrets WHERE project_id = ? ORDER BY key_name").bind(projectId)),
    auth.db.prepare("SELECT provider, env_key, targets_json, sync_status, created_at, updated_at FROM project_databases WHERE project_id = ?").bind(projectId).first<DatabaseRow>(),
    all<{ id: string; environment: string; status: string; url: string | null; created_at: string }>(auth.db.prepare("SELECT id, environment, status, url, created_at FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 12").bind(projectId)),
    auth.db.prepare("SELECT status, account_label, updated_at FROM connections WHERE workspace_id = ? AND provider = 'github' ").bind(auth.workspaceId).first<{ status: string; account_label: string | null; updated_at: string }>(),
    all<{ id: string; action: string; resource_type: string; resource_id: string | null; metadata_json: string; created_at: string }>(auth.db.prepare("SELECT id, action, resource_type, resource_id, metadata_json, created_at FROM project_audit_events WHERE project_id = ? ORDER BY created_at DESC LIMIT 20").bind(projectId)),
    all<{ domain: string; status: string; verification_json: string; updated_at: string }>(auth.db.prepare("SELECT domain, status, verification_json, updated_at FROM project_domains WHERE project_id = ? ORDER BY domain").bind(projectId)),
  ]);
  let domains: Array<{ name: string; verified: boolean; verification: Array<{ type?: string; domain?: string; value?: string; reason?: string }>; status: string }> = storedDomains.map(item => ({ name: item.domain, verified: item.status === "verified", verification: JSON.parse(item.verification_json || "[]"), status: item.status }));
  let domainError: string | null = null;
  if (projectVercelConfigured() && (project.preview_url || project.production_url)) {
    try {
      const live = await listProjectDomains(kodoVercelProjectName(project.name, projectId));
      domains = live.map(item => ({ name: item.name, verified: Boolean(item.verified), verification: item.verification ?? [], status: item.verified ? "verified" : "pending" }));
      const timestamp = now();
      await Promise.all(live.map(item => auth.db.prepare("INSERT INTO project_domains (id, project_id, domain, status, verification_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, domain) DO UPDATE SET status = excluded.status, verification_json = excluded.verification_json, updated_at = excluded.updated_at")
        .bind(id("dom"), projectId, item.name, item.verified ? "verified" : "pending", JSON.stringify(item.verification ?? []), timestamp, timestamp).run()));
    } catch (error) { domainError = error instanceof Error ? error.message : "Could not refresh Vercel domains."; }
  }
  return Response.json({
    project,
    overview: { deploymentCount: deployments.length, readyDeployments: deployments.filter(item => item.status === "ready").length, secretCount: secrets.length, domainCount: domains.length, databaseConnected: Boolean(database) },
    deployments,
    domains,
    domainError,
    secrets: secrets.map(item => ({ id: item.id, key: item.key_name, maskedValue: "••••••••••••", targets: parseStringArray(item.targets_json), gitBranch: item.git_branch, status: item.sync_status, updatedAt: item.updated_at })),
    database: database ? { provider: database.provider, envKey: database.env_key, maskedValue: "••••••••••••", targets: parseStringArray(database.targets_json), status: database.sync_status, updatedAt: database.updated_at } : null,
    resources: [
      { id: "vercel", name: "Vercel Hosting", kind: "hosting", status: projectVercelConfigured() ? "connected" : "disconnected", detail: project.production_url || project.preview_url || null },
      { id: "sandbox", name: "Vercel Sandbox", kind: "build", status: nativeSandboxConfigured() ? "connected" : "disconnected", detail: nativeSandboxConfigured() ? "Secure builds enabled" : null },
      { id: "github", name: "GitHub", kind: "source", status: github?.status === "connected" ? "connected" : "disconnected", detail: project.repository || github?.account_label || null },
      { id: "database", name: database ? `${database.provider} database` : "Database", kind: "data", status: database ? database.sync_status : "disconnected", detail: database?.env_key ?? null },
    ],
    audit: audits.map(item => ({ ...item, metadata: JSON.parse(item.metadata_json || "{}"), metadata_json: undefined })),
    capabilities: { vercel: projectVercelConfigured(), encryption: projectSecretsConfigured() },
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await projectFor(auth, projectId);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = typeof body.action === "string" ? body.action : "";
  try {
    if (action === "add-domain") {
      if (!project.production_url && !project.preview_url) return Response.json({ error: "Deploy the project once before attaching a custom domain." }, { status: 409 });
      const domain = normalizeDomain(String(body.domain ?? ""));
      const result = await addProjectDomain(kodoVercelProjectName(project.name, projectId), domain);
      const timestamp = now();
      await auth.db.prepare("INSERT INTO project_domains (id, project_id, domain, status, verification_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, domain) DO UPDATE SET status = excluded.status, verification_json = excluded.verification_json, updated_at = excluded.updated_at")
        .bind(id("dom"), projectId, domain, result.verified ? "verified" : "pending", JSON.stringify(result.verification ?? []), timestamp, timestamp).run();
      await audit(auth, projectId, "created", "domain", domain, { verified: Boolean(result.verified) });
      return Response.json({ domain: { name: domain, verified: Boolean(result.verified), verification: result.verification ?? [] } }, { status: 201 });
    }
    if (action === "upsert-secret") {
      if (!projectSecretsConfigured()) return Response.json({ error: "Project secret encryption is not configured on KODO." }, { status: 503 });
      const key = normalizeSecretKey(String(body.key ?? ""));
      const value = String(body.value ?? "");
      if (!value || value.length > 16_000) throw new Error("Secret value must contain 1–16,000 characters.");
      if (key.startsWith("NEXT_PUBLIC_")) throw new Error("NEXT_PUBLIC_ variables are visible in the browser. Add public configuration in project files instead of Secrets.");
      const targets = normalizeTargets(body.targets);
      const gitBranch = targets.includes("preview") && typeof body.gitBranch === "string" && body.gitBranch.trim() ? body.gitBranch.trim().slice(0, 250) : null;
      const databaseKey = await auth.db.prepare("SELECT env_key FROM project_databases WHERE project_id = ?").bind(projectId).first<{ env_key: string }>();
      if (databaseKey?.env_key === key) throw new Error(`${key} is managed by the Database tab.`);
      const encrypted = await encryptProjectSecret(value);
      let syncStatus = "pending";
      if (projectVercelConfigured()) {
        await upsertProjectEnvironmentVariable(kodoVercelProjectName(project.name, projectId), { key, value, targets, gitBranch, comment: "Managed securely by KODO" });
        syncStatus = "synced";
      }
      const timestamp = now();
      const existing = await auth.db.prepare("SELECT id FROM project_secrets WHERE project_id = ? AND key_name = ?").bind(projectId, key).first<{ id: string }>();
      const secretId = existing?.id ?? id("sec");
      await auth.db.prepare("INSERT INTO project_secrets (id, project_id, key_name, encrypted_value, targets_json, git_branch, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, key_name) DO UPDATE SET encrypted_value = excluded.encrypted_value, targets_json = excluded.targets_json, git_branch = excluded.git_branch, sync_status = excluded.sync_status, updated_at = excluded.updated_at")
        .bind(secretId, projectId, key, encrypted, JSON.stringify(targets), gitBranch, syncStatus, timestamp, timestamp).run();
      await audit(auth, projectId, existing ? "updated" : "created", "secret", secretId, { key, targets, gitBranch, syncStatus });
      return Response.json({ secret: { id: secretId, key, maskedValue: "••••••••••••", targets, gitBranch, status: syncStatus } }, { status: existing ? 200 : 201 });
    }
    if (action === "connect-database") {
      if (!projectSecretsConfigured()) return Response.json({ error: "Project secret encryption is not configured on KODO." }, { status: 503 });
      const provider = String(body.provider ?? "").toLowerCase();
      const value = String(body.value ?? "").trim();
      const envKey = validateDatabase(provider, value);
      const targets = normalizeTargets(body.targets);
      const duplicateSecret = await auth.db.prepare("SELECT id FROM project_secrets WHERE project_id = ? AND key_name = ?").bind(projectId, envKey).first<{ id: string }>();
      if (duplicateSecret) throw new Error(`${envKey} already exists in Secrets. Delete it before connecting this database.`);
      const previous = await auth.db.prepare("SELECT env_key FROM project_databases WHERE project_id = ?").bind(projectId).first<{ env_key: string }>();
      const encrypted = await encryptProjectSecret(value);
      let syncStatus = "pending";
      if (projectVercelConfigured()) {
        await upsertProjectEnvironmentVariable(kodoVercelProjectName(project.name, projectId), { key: envKey, value, targets, comment: `${provider} database managed securely by KODO` });
        if (previous?.env_key && previous.env_key !== envKey) await removeProjectEnvironmentVariable(kodoVercelProjectName(project.name, projectId), previous.env_key);
        syncStatus = "synced";
      }
      const timestamp = now();
      await auth.db.prepare("INSERT INTO project_databases (project_id, provider, env_key, encrypted_value, targets_json, sync_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(project_id) DO UPDATE SET provider = excluded.provider, env_key = excluded.env_key, encrypted_value = excluded.encrypted_value, targets_json = excluded.targets_json, sync_status = excluded.sync_status, updated_at = excluded.updated_at")
        .bind(projectId, provider, envKey, encrypted, JSON.stringify(targets), syncStatus, timestamp, timestamp).run();
      await audit(auth, projectId, "connected", "database", provider, { envKey, targets, syncStatus });
      return Response.json({ database: { provider, envKey, maskedValue: "••••••••••••", targets, status: syncStatus } }, { status: 201 });
    }
    return Response.json({ error: "Unsupported publishing action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Publishing setting could not be saved." }, { status: 422 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await projectFor(auth, projectId);
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const action = String(body.action ?? "");
  try {
    if (action === "remove-domain") {
      const domain = normalizeDomain(String(body.domain ?? ""));
      await removeProjectDomain(kodoVercelProjectName(project.name, projectId), domain);
      await auth.db.prepare("DELETE FROM project_domains WHERE project_id = ? AND domain = ?").bind(projectId, domain).run();
      await audit(auth, projectId, "deleted", "domain", domain);
      return Response.json({ ok: true });
    }
    if (action === "remove-secret") {
      const secretId = String(body.id ?? "");
      const secret = await auth.db.prepare("SELECT id, key_name FROM project_secrets WHERE id = ? AND project_id = ?").bind(secretId, projectId).first<{ id: string; key_name: string }>();
      if (!secret) return Response.json({ error: "Secret not found." }, { status: 404 });
      if (projectVercelConfigured()) await removeProjectEnvironmentVariable(kodoVercelProjectName(project.name, projectId), secret.key_name);
      await auth.db.prepare("DELETE FROM project_secrets WHERE id = ? AND project_id = ?").bind(secretId, projectId).run();
      await audit(auth, projectId, "deleted", "secret", secretId, { key: secret.key_name });
      return Response.json({ ok: true });
    }
    if (action === "disconnect-database") {
      const database = await auth.db.prepare("SELECT env_key FROM project_databases WHERE project_id = ?").bind(projectId).first<{ env_key: string }>();
      if (!database) return Response.json({ error: "Database is not connected." }, { status: 404 });
      if (projectVercelConfigured()) await removeProjectEnvironmentVariable(kodoVercelProjectName(project.name, projectId), database.env_key);
      await auth.db.prepare("DELETE FROM project_databases WHERE project_id = ?").bind(projectId).run();
      await audit(auth, projectId, "disconnected", "database", database.env_key);
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unsupported publishing action." }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Publishing setting could not be removed." }, { status: 422 });
  }
}
