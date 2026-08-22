import { now } from "../../../../lib/db";
import { normalizePermissions } from "../../../../lib/permissions";
import { requireApiUser, unauthorized } from "../../../../lib/server-auth";
import { canManageMembers } from "../../../../lib/team";

export async function PATCH(request: Request) {
  const auth = await requireApiUser();
  if (!auth) return unauthorized();
  if (!canManageMembers(auth.role)) return Response.json({ error: "Only the owner or an admin can change agent permissions." }, { status: 403 });
  const body = await request.json() as { permissions?: Record<string, unknown> };
  if (!body.permissions || typeof body.permissions !== "object") {
    return Response.json({ error: "permissions object is required." }, { status: 400 });
  }

  const existingRow = await auth.db.prepare("SELECT permissions_json FROM workspace_settings WHERE workspace_id = ?").bind(auth.workspaceId).first<{ permissions_json: string }>();
  let existing: unknown = {};
  try { existing = existingRow ? JSON.parse(existingRow.permissions_json) : {}; } catch { existing = {}; }

  const merged = normalizePermissions({ ...normalizePermissions(existing), ...body.permissions });
  await auth.db.prepare("INSERT INTO workspace_settings (workspace_id, permissions_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(workspace_id) DO UPDATE SET permissions_json = excluded.permissions_json, updated_at = excluded.updated_at")
    .bind(auth.workspaceId, JSON.stringify(merged), now()).run();

  return Response.json({ permissions: merged });
}
