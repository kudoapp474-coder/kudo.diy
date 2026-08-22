import { runKodoAgent } from "../../../../../../../lib/agent-runner";
import { requireApiUser, unauthorized } from "../../../../../../../lib/server-auth";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string; generationId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId, generationId } = await params;
  const body = await request.json().catch(() => ({})) as { model?: string };

  const result = await runKodoAgent({
    db: auth.db,
    workspaceId: auth.workspaceId,
    userEmail: auth.user.email,
    projectId,
    resumeFromGenerationId: generationId,
    model: body.model,
  });
  return Response.json(result.body, { status: result.httpStatus });
}
