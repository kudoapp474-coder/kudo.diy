import { now } from "../../../../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../../../../lib/server-auth";

type GenerationRow = { id: string; status: string };

export async function POST(_request: Request, { params }: { params: Promise<{ projectId: string; generationId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId, generationId } = await params;

  const generation = await auth.db.prepare(`
    SELECT g.id, g.status
    FROM generations g
    INNER JOIN projects p ON p.id = g.project_id
    WHERE g.id = ? AND g.project_id = ? AND p.workspace_id = ?
  `).bind(generationId, projectId, auth.workspaceId).first<GenerationRow>();
  if (!generation) return Response.json({ error: "Agent run not found." }, { status: 404 });
  if (generation.status !== "running") return Response.json({ error: "This agent run has already finished." }, { status: 409 });

  await auth.db.prepare("UPDATE generations SET cancel_requested_at = ? WHERE id = ? AND cancel_requested_at IS NULL")
    .bind(now(), generationId).run();

  return Response.json({ cancelling: true });
}
