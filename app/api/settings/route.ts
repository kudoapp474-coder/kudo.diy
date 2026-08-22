import { normalizePermissions } from "../../../lib/permissions";
import { requireApiUser, unauthorized } from "../../../lib/server-auth";
import { canManageMembers } from "../../../lib/team";

type WorkspaceRow = { name: string; slug: string; plan: string; owner_email: string };
type SettingsRow = { permissions_json: string };

function normalizeSlug(raw: string) {
  return raw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/-{2,}/g, "-").replace(/^-|-$/g, "");
}

export async function GET() {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();

  const workspace = await auth.db.prepare("SELECT name, slug, plan, owner_email FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<WorkspaceRow>();
  if (!workspace) return Response.json({ error: "Workspace not found." }, { status: 404 });
  const settingsRow = await auth.db.prepare("SELECT permissions_json FROM workspace_settings WHERE workspace_id = ?").bind(auth.workspaceId).first<SettingsRow>();

  let parsed: unknown = {};
  try { parsed = settingsRow ? JSON.parse(settingsRow.permissions_json) : {}; } catch { parsed = {}; }

  return Response.json({
    workspace,
    member: { email: auth.user.email, name: auth.user.displayName },
    role: auth.role,
    permissions: normalizePermissions(parsed),
  });
}

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  if (!canManageMembers(auth.role)) return Response.json({ error: "Only the owner or an admin can change workspace settings." }, { status: 403 });
  const body = await request.json() as { name?: string; slug?: string };

  const name = body.name?.trim();
  if (name !== undefined && (name.length < 1 || name.length > 80)) {
    return Response.json({ error: "Workspace name must be between 1 and 80 characters." }, { status: 400 });
  }

  let slug: string | undefined;
  if (body.slug !== undefined) {
    slug = normalizeSlug(body.slug);
    if (slug.length < 3 || slug.length > 50) {
      return Response.json({ error: "Workspace slug must be between 3 and 50 characters (letters, numbers, hyphens)." }, { status: 400 });
    }
    const taken = await auth.db.prepare("SELECT id FROM workspaces WHERE slug = ? AND id != ?").bind(slug, auth.workspaceId).first<{ id: string }>();
    if (taken) return Response.json({ error: "That workspace slug is already taken." }, { status: 409 });
  }

  if (name === undefined && slug === undefined) return Response.json({ error: "Nothing to update." }, { status: 400 });

  const sets: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { sets.push("name = ?"); values.push(name); }
  if (slug !== undefined) { sets.push("slug = ?"); values.push(slug); }
  values.push(auth.workspaceId);
  await auth.db.prepare(`UPDATE workspaces SET ${sets.join(", ")} WHERE id = ?`).bind(...values).run();

  const workspace = await auth.db.prepare("SELECT name, slug, plan, owner_email FROM workspaces WHERE id = ?").bind(auth.workspaceId).first<WorkspaceRow>();
  return Response.json({ workspace });
}
