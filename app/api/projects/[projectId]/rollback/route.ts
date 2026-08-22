import { all, id, now } from "../../../../../lib/db";
import type { ProjectFileRecord } from "../../../../../lib/project-files";
import { InvalidProjectVersionError, parseProjectSnapshot } from "../../../../../lib/project-versions";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";
import { nativeSandboxConfigured, runProjectChecks } from "../../../../../lib/vercel-sandbox";
import { deployStaticProjectToVercel } from "../../../../../lib/vercel-publish";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const body = await request.json().catch(() => ({})) as { versionId?: string };
  if (!body.versionId) return Response.json({ error: "versionId is required." }, { status: 400 });

  const project = await auth.db.prepare("SELECT id, name FROM projects WHERE id = ? AND workspace_id = ?")
    .bind(projectId, auth.workspaceId).first<{ id: string; name: string }>();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  if (!nativeSandboxConfigured()) {
    return Response.json({ error: "Connect Vercel Sandbox before rolling back production.", code: "SANDBOX_SETUP_REQUIRED", connectUrl: "/integrations" }, { status: 503 });
  }

  const version = await auth.db.prepare("SELECT id, label, snapshot_json FROM versions WHERE id = ? AND project_id = ?")
    .bind(body.versionId, projectId).first<{ id: string; label: string; snapshot_json: string }>();
  if (!version) return Response.json({ error: "Version not found." }, { status: 404 });

  let snapshot: ProjectFileRecord[];
  try {
    snapshot = parseProjectSnapshot(version.snapshot_json);
  } catch (error) {
    const message = error instanceof InvalidProjectVersionError ? error.message : "This version snapshot is invalid.";
    return Response.json({ error: message }, { status: 422 });
  }

  const deploymentId = id("dep");
  const timestamp = now();
  await auth.db.prepare("INSERT INTO deployments (id, project_id, version_id, environment, status, created_at, updated_at) VALUES (?, ?, ?, 'production', 'building', ?, ?)")
    .bind(deploymentId, projectId, version.id, timestamp, timestamp).run();

  try {
    const check = await runProjectChecks(snapshot, "npm run build");
    if (check.status !== "passed") {
      await auth.db.prepare("UPDATE deployments SET status = 'failed', updated_at = ? WHERE id = ?").bind(now(), deploymentId).run();
      return Response.json({ error: "Rollback stopped because this version did not pass the production build.", check, deploymentId }, { status: 422 });
    }

    const origin = new URL(request.url).origin;
    const fallbackUrl = `${origin}/p/${encodeURIComponent(projectId)}`;
    const dedicated = await deployStaticProjectToVercel(project.name, projectId, snapshot, "production");
    if (dedicated.configured && "error" in dedicated) {
      await auth.db.prepare("UPDATE deployments SET status = 'failed', updated_at = ? WHERE id = ?").bind(now(), deploymentId).run();
      return Response.json({ error: "Rollback build passed, but Vercel could not publish it.", detail: dedicated.error, deploymentId }, { status: 502 });
    }

    const currentFiles = await all<ProjectFileRecord>(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
    const safetyVersionId = id("ver");
    const restoredAt = now();
    const realDeployment = dedicated.configured ? dedicated : null;
    const url = realDeployment?.url ?? fallbackUrl;
    const status = realDeployment?.status ?? "ready";
    const projectStatus = status === "ready" ? "published" : "deploying";

    await auth.db.prepare("INSERT INTO versions (id, project_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(safetyVersionId, projectId, `Before production rollback: ${version.label}`.slice(0, 120), JSON.stringify(currentFiles), restoredAt).run();
    await auth.db.prepare("DELETE FROM project_files WHERE project_id = ?").bind(projectId).run();
    await auth.db.batch(snapshot.map(file => auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(id("file"), projectId, file.path, file.content, file.language ?? "text", restoredAt)));
    await auth.db.batch([
      auth.db.prepare("UPDATE deployments SET status = ?, url = ?, updated_at = ? WHERE id = ?").bind(status, url, restoredAt, deploymentId),
      auth.db.prepare("UPDATE projects SET status = ?, production_url = ?, updated_at = ? WHERE id = ? AND workspace_id = ?").bind(projectStatus, url, restoredAt, projectId, auth.workspaceId),
    ]);

    return Response.json({
      rollback: { versionId: version.id, label: version.label, restored: snapshot.length, safetyVersionId },
      deployment: { id: deploymentId, status, url, provider: realDeployment ? "Vercel" : "KODO secure hosting" },
      check,
      warning: dedicated.configured ? null : "Vercel publishing is not connected, so KODO restored its secure public URL.",
    }, { status: status === "ready" ? 201 : 202 });
  } catch (error) {
    await auth.db.prepare("UPDATE deployments SET status = 'failed', updated_at = ? WHERE id = ?").bind(now(), deploymentId).run();
    const detail = error instanceof Error ? error.message : "Rollback failed";
    return Response.json({ error: "KODO could not roll back production.", detail: detail.slice(0, 500), deploymentId }, { status: 502 });
  }
}
