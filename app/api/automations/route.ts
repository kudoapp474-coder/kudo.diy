import { all, id, now } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const automations = await all(auth.db.prepare(`
    SELECT a.*, p.name AS project_name
    FROM automations a
    LEFT JOIN projects p ON p.id = a.project_id
    WHERE a.workspace_id = ?
    ORDER BY a.created_at DESC
  `).bind(auth.workspaceId));
  return Response.json({ automations });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { name?: string; prompt?: string; triggerType?: string; triggerConfig?: Record<string, unknown>; projectId?: string };
  if (!body.name?.trim() || !body.prompt?.trim() || !body.triggerType || !body.projectId) return Response.json({ error: "name, prompt, triggerType and projectId are required." }, { status: 400 });

  const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(body.projectId, auth.workspaceId).first<{ id: string }>();
  if (!project) return Response.json({ error: "Choose a project in this workspace." }, { status: 400 });

  const automationId = id("auto");
  await auth.db.prepare("INSERT INTO automations (id, workspace_id, project_id, name, prompt, trigger_type, trigger_config_json, active, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)")
    .bind(automationId, auth.workspaceId, body.projectId, body.name.slice(0, 120), body.prompt.slice(0, 4000), body.triggerType.slice(0, 60), JSON.stringify(body.triggerConfig ?? {}), now()).run();
  return Response.json({ automation: { id: automationId, active: true } }, { status: 201 });
}
