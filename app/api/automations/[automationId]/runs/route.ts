import { all } from "../../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";

export async function GET(_request: Request, { params }: { params: Promise<{ automationId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { automationId } = await params;
  const owned = await auth.db.prepare("SELECT id FROM automations WHERE id = ? AND workspace_id = ?").bind(automationId, auth.workspaceId).first<{ id: string }>();
  if (!owned) return Response.json({ error: "Automation not found." }, { status: 404 });

  const runs = await all(auth.db.prepare(`
    SELECT id, trigger, status, error, generation_id, created_at, updated_at
    FROM automation_runs
    WHERE automation_id = ?
    ORDER BY created_at DESC
    LIMIT 20
  `).bind(automationId));
  return Response.json({ runs });
}
