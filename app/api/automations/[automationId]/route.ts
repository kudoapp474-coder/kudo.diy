import { requireApiUser, unauthorized } from "../../../../lib/server-auth";

type RouteContext = { params: Promise<{ automationId: string }> };

async function ownedAutomation(auth: NonNullable<Awaited<ReturnType<typeof requireApiUser>>>, automationId: string) {
  return auth.db.prepare("SELECT id FROM automations WHERE id = ? AND workspace_id = ?").bind(automationId, auth.workspaceId).first<{ id: string }>();
}

export async function PATCH(request: Request, { params }: RouteContext) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { automationId } = await params;
  if (!(await ownedAutomation(auth, automationId))) return Response.json({ error: "Automation not found." }, { status: 404 });

  const body = await request.json().catch(() => ({})) as {
    name?: string; prompt?: string; projectId?: string; triggerType?: string; triggerConfig?: Record<string, unknown>; active?: boolean;
  };

  const fields: string[] = [];
  const values: unknown[] = [];
  if (typeof body.name === "string" && body.name.trim()) { fields.push("name = ?"); values.push(body.name.trim().slice(0, 120)); }
  if (typeof body.prompt === "string" && body.prompt.trim()) { fields.push("prompt = ?"); values.push(body.prompt.trim().slice(0, 4000)); }
  if (typeof body.triggerType === "string" && body.triggerType.trim()) { fields.push("trigger_type = ?"); values.push(body.triggerType.trim().slice(0, 60)); }
  if (body.triggerConfig !== undefined) { fields.push("trigger_config_json = ?"); values.push(JSON.stringify(body.triggerConfig ?? {})); }
  if (typeof body.active === "boolean") { fields.push("active = ?"); values.push(body.active ? 1 : 0); }
  if (typeof body.projectId === "string" && body.projectId.trim()) {
    const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(body.projectId, auth.workspaceId).first<{ id: string }>();
    if (!project) return Response.json({ error: "Choose a project in this workspace." }, { status: 400 });
    fields.push("project_id = ?"); values.push(body.projectId);
  }
  if (!fields.length) return Response.json({ error: "Nothing to update." }, { status: 400 });

  await auth.db.prepare(`UPDATE automations SET ${fields.join(", ")} WHERE id = ?`).bind(...values, automationId).run();
  return Response.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { automationId } = await params;
  if (!(await ownedAutomation(auth, automationId))) return Response.json({ error: "Automation not found." }, { status: 404 });

  await auth.db.batch([
    auth.db.prepare("DELETE FROM automation_runs WHERE automation_id = ?").bind(automationId),
    auth.db.prepare("DELETE FROM automations WHERE id = ?").bind(automationId),
  ]);
  return Response.json({ ok: true });
}
