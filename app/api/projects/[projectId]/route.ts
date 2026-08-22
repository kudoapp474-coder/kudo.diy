import { all, now } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await auth.db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const [files, generations, versions, deployments, workspace] = await Promise.all([
    all(auth.db.prepare("SELECT id, path, content, language, updated_at FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId)),
    all(auth.db.prepare("SELECT id, prompt, result, steps_json, status, model, credits_used, error, created_at, updated_at FROM generations WHERE project_id = ? ORDER BY created_at DESC LIMIT 50").bind(projectId)),
    all(auth.db.prepare("SELECT id, label, generation_id, created_at FROM versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 30").bind(projectId)),
    all(auth.db.prepare("SELECT id, version_id, environment, status, url, created_at, updated_at FROM deployments WHERE project_id = ? ORDER BY created_at DESC LIMIT 30").bind(projectId)),
    auth.db.prepare("SELECT plan, credits FROM workspaces WHERE id = ?").bind(auth.workspaceId).first(),
  ]);
  return Response.json({ project, files, generations, versions, deployments, workspace });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const body = await request.json() as { name?: string; status?: string; previewUrl?: string; productionUrl?: string };
  const existing = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!existing) return Response.json({ error: "Project not found." }, { status: 404 });
  await auth.db.prepare("UPDATE projects SET name = COALESCE(?, name), status = COALESCE(?, status), preview_url = COALESCE(?, preview_url), production_url = COALESCE(?, production_url), updated_at = ? WHERE id = ?")
    .bind(body.name?.slice(0, 100) ?? null, body.status?.slice(0, 30) ?? null, body.previewUrl?.slice(0, 500) ?? null, body.productionUrl?.slice(0, 500) ?? null, now(), projectId).run();
  return Response.json({ ok: true });
}
