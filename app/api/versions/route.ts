import { all, id, now } from "../../../lib/db";
import { safeProjectPath, type ProjectFileRecord } from "../../../lib/project-files";
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

  let snapshot: ProjectFileRecord[] = [];
  try {
    const parsed = JSON.parse(version.snapshot_json) as unknown;
    if (!Array.isArray(parsed)) throw new Error("Invalid snapshot");
    snapshot = parsed.filter((file): file is ProjectFileRecord => Boolean(file && typeof file === "object" && "path" in file && "content" in file && typeof file.path === "string" && typeof file.content === "string"));
  } catch {
    return Response.json({ error: "This version snapshot is invalid." }, { status: 422 });
  }
  if (!snapshot.length || snapshot.length > 80 || snapshot.some(file => !safeProjectPath(file.path) || Buffer.byteLength(file.content, "utf8") > 120_000)) {
    return Response.json({ error: "This version cannot be restored safely." }, { status: 422 });
  }

  const currentFiles = await all(auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(body.projectId));
  const timestamp = now();
  await auth.db.prepare("INSERT INTO versions (id, project_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(id("ver"), body.projectId, "Before restore", JSON.stringify(currentFiles), timestamp).run();
  await auth.db.prepare("DELETE FROM project_files WHERE project_id = ?").bind(body.projectId).run();
  await auth.db.batch(snapshot.map(file => auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id("file"), body.projectId, file.path, file.content, file.language ?? "text", timestamp)));
  await auth.db.prepare("UPDATE projects SET status = 'draft', updated_at = ? WHERE id = ? AND workspace_id = ?").bind(timestamp, body.projectId, auth.workspaceId).run();
  return Response.json({ ok: true, restored: snapshot.length, label: version.label });
}
