import { all, id, now } from "../../../../../lib/db";
import { safeProjectPath } from "../../../../../lib/project-files";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";

type RouteContext = { params: Promise<{ projectId: string }> };

async function ownedProject(projectId: string) {
  const auth = await requireApiUser();
  if (!auth) return { response: unauthorized() } as const;
  const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!project) return { response: Response.json({ error: "Project not found." }, { status: 404 }) } as const;
  return { auth } as const;
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await ownedProject(projectId);
  if ("response" in access) return access.response;
  const body = await request.json() as { path?: string; content?: string; language?: string };
  const path = safeProjectPath(body.path ?? "");
  if (!path || typeof body.content !== "string") return Response.json({ error: "A safe path and text content are required." }, { status: 400 });
  if (Buffer.byteLength(body.content, "utf8") > 120_000) return Response.json({ error: "A project file cannot exceed 120 KB." }, { status: 413 });

  const timestamp = now();
  await access.auth.db.prepare("INSERT INTO project_files (id, project_id, path, content, language, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, path) DO UPDATE SET content = excluded.content, language = excluded.language, updated_at = excluded.updated_at")
    .bind(id("file"), projectId, path, body.content, body.language?.slice(0, 40) || "text", timestamp).run();
  await access.auth.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND workspace_id = ?").bind(timestamp, projectId, access.auth.workspaceId).run();

  const files = await all(access.auth.db.prepare("SELECT path, content, language FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
  const versionId = id("ver");
  await access.auth.db.prepare("INSERT INTO versions (id, project_id, label, snapshot_json, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(versionId, projectId, `Saved ${path}`.slice(0, 120), JSON.stringify(files), timestamp).run();
  return Response.json({ file: { path, language: body.language || "text", updated_at: timestamp }, versionId });
}

export async function DELETE(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const access = await ownedProject(projectId);
  if ("response" in access) return access.response;
  const body = await request.json() as { path?: string };
  const path = safeProjectPath(body.path ?? "");
  if (!path) return Response.json({ error: "A safe path is required." }, { status: 400 });
  if (["index.html", "package.json", "scripts/build.mjs"].includes(path)) return Response.json({ error: "This core project file cannot be deleted." }, { status: 409 });
  await access.auth.db.prepare("DELETE FROM project_files WHERE project_id = ? AND path = ?").bind(projectId, path).run();
  await access.auth.db.prepare("UPDATE projects SET updated_at = ? WHERE id = ? AND workspace_id = ?").bind(now(), projectId, access.auth.workspaceId).run();
  return Response.json({ ok: true });
}
