import { all, id, now } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const projects = await all(auth.db.prepare("SELECT * FROM projects WHERE workspace_id = ? ORDER BY updated_at DESC").bind(auth.workspaceId));
  return Response.json({ projects });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { name?: string; description?: string; repository?: string };
  const name = body.name?.trim();
  if (!name) return Response.json({ error: "Project name is required." }, { status: 400 });
  const projectId = id("prj");
  const timestamp = now();
  await auth.db.prepare("INSERT INTO projects (id, workspace_id, name, description, repository, branch, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'main', 'draft', ?, ?)")
    .bind(projectId, auth.workspaceId, name.slice(0, 100), body.description?.slice(0, 500) ?? "", body.repository?.slice(0, 200) ?? null, timestamp, timestamp).run();
  return Response.json({ project: { id: projectId, name, status: "draft", created_at: timestamp } }, { status: 201 });
}
