import { runKodoAgent } from "../../../lib/agent-runner";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";

export const maxDuration = 300;

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const body = await request.json() as { projectId?: string; prompt?: string; model?: string };
  const prompt = body.prompt?.trim();
  const projectId = body.projectId?.trim();
  if (!prompt || !projectId) return Response.json({ error: "projectId and prompt are required." }, { status: 400 });

  const result = await runKodoAgent({
    db: auth.db,
    workspaceId: auth.workspaceId,
    userEmail: auth.user.email,
    projectId,
    prompt,
    model: body.model,
  });
  return Response.json(result.body, { status: result.httpStatus });
}
