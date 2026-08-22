import { all, id, now } from "../../../lib/db";
import { InvalidProjectVersionError, parseProjectSnapshot } from "../../../lib/project-versions";
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

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { projectId?: string; versionId?: string };
  if (!body.projectId || !body.versionId) return Response.json({ error: "projectId and versionId are required." }, { status: 400 });
  const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(body.projectId, auth.workspaceId).first();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  const version = await auth.db.prepare("SELECT snapshot_json, label FROM versions WHERE id = ? AND project_id = ?").bind(body.versionId, body.projectId).first<{ snapshot_json: string; label: string }>();
  if (!version) return Response.json({ error: "Version not found." }, { status: 404 });

  let snapshot;
  try {
    snapshot = parseProjectSnapshot(version.snapshot_json);
  } catch (error) {
    const message = error instanceof InvalidProjectVersionError ? error.message : "This version snapshot is invalid.";
    return Response.json({ error: message }, { status: 422 });
  }

  const currentFiles = await all(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(body.projectId));
  const timestamp = now();
  const safetyVersionId = id("ver");
  await auth.db.prepare("INSERT INTO versions (id, project_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(safetyVersionId, body.projectId, `Before restore: ${version.label}`.slice(0, 120), JSON.stringify(currentFiles), timestamp).run();
  await auth.db.prepare("DELETE FROM project_files WHERE project_id = ?").bind(body.projectId).run();
  await auth.db.batch(snapshot.map(file => auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id("file"), body.projectId, file.path, file.content, file.language ?? "text", timestamp)));
  await auth.db.prepare("UPDATE projects SET status = 'draft', updated_at = ? WHERE id = ? AND workspace_id = ?").bind(timestamp, body.projectId, auth.workspaceId).run();
  return Response.json({ ok: true, restored: snapshot.length, label: version.label, safetyVersionId });
}
