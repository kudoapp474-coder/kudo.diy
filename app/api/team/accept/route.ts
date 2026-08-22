import { now } from "../../../../lib/db";
import { ACTIVE_WORKSPACE_COOKIE, requireApiUser, unauthorized } from "../../../../lib/server-auth";

type InviteRow = { id: string; workspace_id: string; email: string; status: string };
type WorkspaceRow = { name: string };

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const body = await request.json() as { token?: string };
  const token = body.token?.trim();
  if (!token) return Response.json({ error: "This invite link is invalid." }, { status: 400 });

  const invite = await auth.db.prepare("SELECT id, workspace_id, email, status FROM workspace_members WHERE invite_token = ?").bind(token).first<InviteRow>();
  if (!invite || invite.status !== "invited") return Response.json({ error: "This invite link has expired or was already used." }, { status: 404 });
  if (invite.email !== auth.user.email.toLowerCase()) {
    return Response.json({ error: `This invite was sent to ${invite.email}. Sign in with that email to accept it.` }, { status: 403 });
  }

  await auth.db.prepare("UPDATE workspace_members SET status = 'active', joined_at = ?, invite_token = NULL WHERE id = ?").bind(now(), invite.id).run();
  const workspace = await auth.db.prepare("SELECT name FROM workspaces WHERE id = ?").bind(invite.workspace_id).first<WorkspaceRow>();

  return Response.json(
    { workspaceId: invite.workspace_id, workspaceName: workspace?.name ?? "Workspace" },
    { headers: { "set-cookie": `${ACTIVE_WORKSPACE_COOKIE}=${encodeURIComponent(invite.workspace_id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000` } },
  );
}
