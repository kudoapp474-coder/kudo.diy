import { requireApiUser, unauthorized } from "../../../../../lib/server-auth";
import { canManageMembers, isValidInviteRole } from "../../../../../lib/team";

type MemberRow = { email: string; role: string };

export async function PATCH(request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  if (!canManageMembers(auth.role)) return Response.json({ error: "Only the owner or an admin can change roles." }, { status: 403 });

  const { memberId } = await params;
  const body = await request.json() as { role?: string };
  if (!body.role || !isValidInviteRole(body.role)) return Response.json({ error: "Role must be admin or member." }, { status: 400 });

  const member = await auth.db.prepare("SELECT email, role FROM workspace_members WHERE id = ? AND workspace_id = ?").bind(memberId, auth.workspaceId).first<MemberRow>();
  if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
  if (member.role === "owner") return Response.json({ error: "The workspace owner's role can't be changed." }, { status: 400 });

  await auth.db.prepare("UPDATE workspace_members SET role = ? WHERE id = ? AND workspace_id = ?").bind(body.role, memberId, auth.workspaceId).run();
  return Response.json({ member: { id: memberId, role: body.role } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ memberId: string }> }) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const { memberId } = await params;
  const member = await auth.db.prepare("SELECT email, role FROM workspace_members WHERE id = ? AND workspace_id = ?").bind(memberId, auth.workspaceId).first<MemberRow>();
  if (!member) return Response.json({ error: "Member not found." }, { status: 404 });
  if (member.role === "owner") return Response.json({ error: "The workspace owner can't be removed." }, { status: 400 });

  const isSelf = member.email === auth.user.email.toLowerCase();
  if (!isSelf && !canManageMembers(auth.role)) return Response.json({ error: "Only the owner or an admin can remove members." }, { status: 403 });

  await auth.db.prepare("DELETE FROM workspace_members WHERE id = ? AND workspace_id = ?").bind(memberId, auth.workspaceId).run();
  return Response.json({ removed: true });
}
