import { all, now } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await auth.db.prepare("SELECT * FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const [files, generations, versions] = await Promise.all([
    all(auth.db.prepare("SELECT id, path, language, updated_at FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId)),
    all(auth.db.prepare("SELECT id, prompt, result, status, model, credits_used, created_at FROM generations WHERE project_id = ? ORDER BY created_at DESC LIMIT 50").bind(projectId)),
    all(auth.db.prepare("SELECT id, label, generation_id, created_at FROM versions WHERE project_id = ? ORDER BY created_at DESC LIMIT 30").bind(projectId)),
  ]);
  return Response.json({ project, files, generations, versions });
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
