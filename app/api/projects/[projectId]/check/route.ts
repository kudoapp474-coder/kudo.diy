import { all, now } from "../../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";
import { nativeSandboxConfigured, runProjectChecks } from "../../../../../lib/vercel-sandbox";

export const maxDuration = 300;

export async function POST(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  const { projectId } = await params;
  const project = await auth.db.prepare("SELECT id FROM projects WHERE id = ? AND workspace_id = ?").bind(projectId, auth.workspaceId).first();
  if (!project) return Response.json({ error: "Project not found." }, { status: 404 });
  if (!nativeSandboxConfigured()) return Response.json({ error: "Vercel Sandbox is not connected.", code: "SANDBOX_SETUP_REQUIRED", connectUrl: "/integrations" }, { status: 503 });
  const body = await request.json().catch(() => ({})) as { command?: string };
  const files = await all<{ path: string; content: string }>(auth.db.prepare("SELECT path, content FROM project_files WHERE project_id = ? ORDER BY path").bind(projectId));
  try {
    const result = await runProjectChecks(files, body.command?.trim() || "npm run build");
    if (result.status === "passed") await auth.db.prepare("UPDATE projects SET status = 'verified', updated_at = ? WHERE id = ? AND workspace_id = ?").bind(now(), projectId, auth.workspaceId).run();
    return Response.json({ result }, { status: result.status === "passed" ? 200 : 422 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sandbox check failed";
    return Response.json({ error: "KODO could not complete the secure build check.", detail: message.slice(0, 500) }, { status: 502 });
  }
}
