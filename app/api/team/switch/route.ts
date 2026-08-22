import { ACTIVE_WORKSPACE_COOKIE, requireApiUser, unauthorized } from "../../../../lib/server-auth";

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const body = await request.json() as { workspaceId?: string };
  const workspaceId = body.workspaceId?.trim();
  if (!workspaceId) return Response.json({ error: "workspaceId is required." }, { status: 400 });

  const membership = await auth.db.prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND email = ? AND status = 'active'")
    .bind(workspaceId, auth.user.email.toLowerCase()).first<{ role: string }>();
  if (!membership) return Response.json({ error: "You don't have access to that workspace." }, { status: 403 });

  return Response.json(
    { workspaceId },
    { headers: { "set-cookie": `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(workspaceId)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` } },
  );
}
