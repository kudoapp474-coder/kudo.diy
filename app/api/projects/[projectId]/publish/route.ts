import { all, id, now } from "../../../../../lib/db";
import type { ProjectFileRecord } from "../../../../../lib/project-files";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";
import { nativeSandboxConfigured, runProjectChecks } from "../../../../../lib/vercel-sandbox";
import { deployStaticProjectToVercel } from "../../../../../lib/vercel-publish";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await auth.db.prepare("SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first<{ id: string; name: string }>();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  if (!nativeSandboxConfigured()) return Response.json({ error: "Connect Vercel Sandbox before publishing.", code: "SANDBOX_SETUP_REQUIRED", connectUrl: "/integrations" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { target?: "preview" | "production" };
  const target = body.target === "preview" ? "preview" : "production";
  const files = await all<ProjectFileRecord>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
  const deploymentId = id("dep");
  const versionId = id("ver");
  const timestamp = now();
  await auth.db.prepare("INSERT INTO versions (id, project_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(versionId, projectId, target === "production" ? "Production publish" : "Preview publish", JSON.stringify(files), timestamp).run();
  await auth.db.prepare("INSERT INTO deployments (id, project_id, version_id, environment, status, created_at, updated_at) VALUES (?, ?, ?, ?, 'building', ?, ?)")
    .bind(deploymentId, projectId, versionId, target, timestamp, timestamp).run();

  try {
    const check = await runProjectChecks(files, "npm run build");
    if (check.status !== "passed") {
      await auth.db.prepare("UPDATE deployments SET status = 'failed', updated_at = ? WHERE id = ?").bind(now(), deploymentId).run();
      return Response.json({ error: "Production build failed. Fix the reported issue before publishing.", check, deploymentId }, { status: 422 });
    }

    const origin = new URL(request.url).origin;
    const kodoUrl = `${origin}/p/${encodeURIComponent(projectId)}`;
    const dedicated = await deployStaticProjectToVercel(project.name, projectId, files, target);
    const url = kodoUrl;
    const warning = dedicated.configured && "error" in dedicated ? `${dedicated.error} Published on the secure KODO URL instead.` : null;
    const updateProject = target === "preview"
      ? auth.db.prepare("UPDATE projects SET status = 'published', preview_url = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").bind(url, now(), projectId, auth.workspaceId)
      : auth.db.prepare("UPDATE projects SET status = 'published', production_url = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").bind(url, now(), projectId, auth.workspaceId);
    await auth.db.batch([
      auth.db.prepare("UPDATE deployments SET status = 'ready', url = ?, updated_at = ? WHERE id = ?").bind(url, now(), deploymentId),
      updateProject,
    ]);
    const externalUrl = dedicated.configured && "url" in dedicated ? dedicated.url ?? null : null;
    return Response.json({ deployment: { id: deploymentId, versionId, environment: target, status: "ready", url, provider: "KODO on Vercel", externalUrl }, check, warning }, { status: 201 });
  } catch (error) {
    await auth.db.prepare("UPDATE deployments SET status = 'failed', updated_at = ? WHERE id = ?").bind(now(), deploymentId).run();
    const detail = error instanceof Error ? error.message : "Publish failed";
    return Response.json({ error: "KODO could not publish this project.", detail: detail.slice(0, 500), deploymentId }, { status: 502 });
  }
}
