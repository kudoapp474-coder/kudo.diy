import { all, id, now } from "../../../lib/db";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  return Response.json({ automations: await all(auth.db.prepare("SELECT * FROM automations WHERE workspace_id = ? ORDER BY created_at DESC").bind(auth.workspaceId)) });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { name?: string; prompt?: string; triggerType?: string; triggerConfig?: Record<string, unknown> };
  if (!body.name?.trim() || !body.prompt?.trim() || !body.triggerType) return Response.json({ error: "name, prompt and triggerType are required." }, { status: 400 });
  const automationId = id("auto");
  await auth.db.prepare("INSERT INTO automations (id, workspace_id, name, prompt, trigger_type, trigger_config_json, active, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)")
    .bind(automationId, auth.workspaceId, body.name.slice(0, 120), body.prompt.slice(0, 4000), body.triggerType.slice(0, 60), JSON.stringify(body.triggerConfig ?? {}), now()).run();
  return Response.json({ automation: { id: automationId, active: true } }, { status: 201 });
}
