import { all, id, now } from "../../../lib/db";
import { getGitHubInstallationToken } from "../../../lib/github-app";
import { importGitHubRepository } from "../../../lib/github-import";
import { starterProjectFiles } from "../../../lib/project-files";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const projects = await all(auth.db.prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC").bind(auth.workspaceId));
  return Response.json({ projects });
}
function readInstallationId(metadata: string | null | undefined) {
  try { return String(JSON.parse(metadata ?? "{}").installationId ?? ""); } catch { return ""; }
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const entitlement = await auth.db.prepare("SELECT w.plan, COUNT(p.id) AS project_count FROM workspaces w LEFT JOIN projects p ON p.workspace_id = w.id WHERE w.id = ? GROUP BY w.id, w.plan").bind(auth.workspaceId).first<{ plan: string; project_count: number | string }>();
  if (entitlement?.plan !== "pro" && Number(entitlement?.project_count ?? 0) >= 2) return Response.json({ error: "The Free plan includes up to 2 projects. Upgrade to KODO Pro for unlimited projects.", code: "PROJECT_LIMIT_REACHED", upgradeUrl: "/pricing" }, { status: 403 });

  const body = await request.json() as { name?: string; description?: string; repository?: string; branch?: string; prompt?: string };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Project name is required." }, { status: 400 });
  const repository = body.repository?.trim() || "";
  let branch = "main";
  let files = starterProjectFiles(name);
  let importSummary: { imported: number; skipped: number } | null = null;

  if (repository) {
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) return Response.json({ error: "Choose a valid repository connected to the KODO GitHub App." }, { status: 400 });
    const connection = await auth.db.prepare("SELECT metadata_json FROM connections WHERE workspace_id = ? AND provider = 'github' AND status = 'connected'").bind(auth.workspaceId).first<{ metadata_json: string }>();
    const installationId = readInstallationId(connection?.metadata_json);
    if (!installationId) return Response.json({ error: "Connect GitHub before importing a repository.", code: "GITHUB_SETUP_REQUIRED", connectUrl: "/api/github/connect?returnTo=/workspace" }, { status: 503 });
    try {
      const token = await getGitHubInstallationToken(installationId);
      const imported = await importGitHubRepository(repository, body.branch, token);
      branch = imported.branch; files = imported.files;
      importSummary = { imported: imported.imported, skipped: imported.skipped };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not import the selected GitHub repository.";
      return Response.json({ error: message.slice(0, 400), code: "GITHUB_IMPORT_FAILED" }, { status: 502 });
    }
  }

  const projectId = id("prj");
  const timestamp = now();
  await auth.db.batch([
    auth.db.prepare("INSERT INTO projects (id, workspace_id, name, description, repository, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)").bind(projectId, auth.workspaceId, name.slice(0, 100), body.description?.slice(0, 500) ?? "", repository || null, branch, timestamp, timestamp),
    ...files.map(file => auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)").bind(id("file"), projectId, file.path, file.content, file.language ?? "text", timestamp)),
  ]);
  return Response.json({ project: { id: projectId, name, repository: repository || null, branch, status: "draft", created_at: timestamp }, importSummary, initialTask: body.prompt?.trim().slice(0, 12000) || null }, { status: 201 });
}
