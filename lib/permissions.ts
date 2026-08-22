import type { KodoDatabase } from "./db";

export const PERMISSION_KEYS = ["runTests", "createCommits", "openPullRequests", "productionDeploys"] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];

export type WorkspacePermissions = Record<PermissionKey, boolean>;

export const DEFAULT_PERMISSIONS: WorkspacePermissions = {
  runTests: true,
  createCommits: true,
  openPullRequests: false,
  productionDeploys: false,
};

export function normalizePermissions(raw: unknown): WorkspacePermissions {
  const source = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  const permissions = { ...DEFAULT_PERMISSIONS };
  for (const key of PERMISSION_KEYS) {
    if (typeof source[key] === "boolean") permissions[key] = source[key] as boolean;
  }
  return permissions;
}

export async function loadWorkspacePermissions(db: KodoDatabase, workspaceId: string): Promise<WorkspacePermissions> {
  const row = await db.prepare("SELECT permissions_json FROM workspace_settings WHERE workspace_id = ?").bind(workspaceId).first<{ permissions_json: string }>();
  let parsed: unknown = {};
  try { parsed = row ? JSON.parse(row.permissions_json) : {}; } catch { parsed = {}; }
  return normalizePermissions(parsed);
}
