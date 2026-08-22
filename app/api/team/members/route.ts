import { all, id, now } from "../../../../lib/db";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";
import { canManageMembers, isValidInviteRole } from "../../../../lib/team";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type MemberRow = { id: string; email: string; role: string; status: string; invited_by: string; invite_token: string | null; created_at: string; joined_at: string | null };

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const members = await all<MemberRow>(auth.db.prepare(
    "SELECT id, email, role, status, invited_by, invite_token, created_at, joined_at FROM workspace_members WHERE workspace_id = ? ORDER BY (role = 'owner') DESC, (role = 'admin') DESC, created_at ASC"
  ).bind(auth.workspaceId));

  return Response.json({
    role: auth.role,
    members: members.map(member => ({
      ...member,
      invite_token: member.email === auth.user.email.toLowerCase() || canManageMembers(auth.role) ? member.invite_token : null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  if (!canManageMembers(auth.role)) return Response.json({ error: "Only the owner or an admin can invite members." }, { status: 403 });

  const body = await request.json() as { email?: string; role?: string };
  const email = body.email?.trim().toLowerCase();
  const role = body.role ?? "member";
  if (!email || !EMAIL_PATTERN.test(email)) return Response.json({ error: "Enter a valid email address." }, { status: 400 });
  if (!isValidInviteRole(role)) return Response.json({ error: "Role must be admin or member." }, { status: 400 });

  const existing = await auth.db.prepare("SELECT id, status FROM workspace_members WHERE workspace_id = ? AND email = ?").bind(auth.workspaceId, email).first<{ id: string; status: string }>();
  if (existing) return Response.json({ error: existing.status === "active" ? "This person is already a member." : "This person already has a pending invite." }, { status: 409 });

  const memberId = id("member");
  const inviteToken = crypto.randomUUID();
  await auth.db.prepare("INSERT INTO workspace_members (id, workspace_id, email, role, status, invited_by, invite_token, created_at) VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)")
    .bind(memberId, auth.workspaceId, email, role, auth.user.email, inviteToken, now()).run();

  return Response.json({ member: { id: memberId, email, role, status: "invited", invite_token: inviteToken } }, { status: 201 });
}
