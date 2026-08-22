import { all } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

type WorkspaceRow = { id: string; name: string; slug: string; plan: string; role: string };

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const workspaces = await all<WorkspaceRow>(auth.db.prepare(`
    SELECT w.id, w.name, w.slug, w.plan, m.role
    FROM workspace_members m
    JOIN workspaces w ON w.id = m.workspace_id
    WHERE m.email = ? AND m.status = 'active'
    ORDER BY (m.role = 'owner') DESC, w.name ASC
  `).bind(auth.user.email.toLowerCase()));

  return Response.json({ workspaces: workspaces.map(workspace => ({ ...workspace, current: workspace.id === auth.workspaceId })) });
}
