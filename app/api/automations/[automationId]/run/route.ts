import { runAutomation } from "../../../../../lib/automation-runner";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ automationId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { automationId } = await params;
  const automation = await auth.db.prepare("SELECT id, project_id, prompt FROM automations WHERE id = ? AND workspace_id = ?")
    .bind(automationId, auth.workspaceId).first<{ id: string; project_id: string | null; prompt: string }>();
  if (!automation) return Response.json({ error: "Automation not found." }, { status: 404 });
  if (!automation.project_id) return Response.json({ error: "This automation has no linked project." }, { status: 400 });

  const { result } = await runAutomation({
    db: auth.db,
    automationId,
    workspaceId: auth.workspaceId,
    userEmail: auth.user.email,
    projectId: automation.project_id,
    prompt: automation.prompt,
    trigger: "manual",
  });
  return Response.json(result.body, { status: result.httpStatus });
}
