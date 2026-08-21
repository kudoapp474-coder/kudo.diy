import { all, id, now } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { projectId?: string; label?: string };
  if (!body.projectId) return Response.json({ error: "projectId is required." }, { status: 400 });
  const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(body.projectId, auth.workspaceId).first();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const files = await all(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(body.projectId));
  const versionId = id("ver");
  await auth.db.prepare("INSERT INTO versions (id, project_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(versionId, body.projectId, body.label?.slice(0, 120) || "Manual checkpoint", JSON.stringify(files), now()).run();
  return Response.json({ version: { id: versionId, files: files.length } }, { status: 201 });
}
