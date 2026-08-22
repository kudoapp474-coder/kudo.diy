import { all } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

type ProjectResult = { id: string; name: string; description: string; status: string };
type AgentResult = { id: string; project_id: string; project_name: string; prompt: string; status: string };
type FileResult = { project_id: string; project_name: string; path: string };

export async function GET(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120) ?? "";
  if (query.length < 2) return Response.json({ projects: [], agents: [], files: [] });
  const like = `%${query.toLowerCase()}%`;

  const [projects, agents, files] = await Promise.all([
    all<ProjectResult>(auth.db.prepare(
      "SELECT id, name, description, status FROM projects WHERE workspace_id = ? AND (LOWER(name) LIKE ? OR LOWER(description) LIKE ?) ORDER BY updated_at DESC LIMIT 5",
    ).bind(auth.workspaceId, like, like)),
    all<AgentResult>(auth.db.prepare(`
      SELECT g.id, g.project_id, p.name AS project_name, g.prompt, g.status
      FROM generations g JOIN projects p ON p.id = g.project_id
      WHERE g.workspace_id = ? AND LOWER(g.prompt) LIKE ?
      ORDER BY g.created_at DESC LIMIT 5
    `).bind(auth.workspaceId, like)),
    all<FileResult>(auth.db.prepare(`
      SELECT pf.project_id, p.name AS project_name, pf.path
      FROM project_files pf JOIN projects p ON p.id = pf.project_id
      WHERE p.workspace_id = ? AND LOWER(pf.path) LIKE ?
      ORDER BY pf.updated_at DESC LIMIT 5
    `).bind(auth.workspaceId, like)),
  ]);

  return Response.json({ projects, agents, files }, { headers: { "cache-control": "no-store" } });
}
