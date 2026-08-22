import { auth, currentUser } from "@clerk/nextjs/server";
import { cookies } from "next/headers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { ensureDatabase, id, now } from "./db";
import type { MemberRole } from "./team";

export const ACTIVE_WORKSPACE_COOKIE = "kodo_active_workspace";

export async function requireApiUser() {
  let user = await getChatGPTUser();

  if (process.env.CLERK_SECRET_KEY && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const session = await auth();
    if (!session.userId) return null;
    const clerkUser = await currentUser();
    const email = clerkUser?.primaryEmailAddress?.emailAddress ?? clerkUser?.emailAddresses[0]?.emailAddress;
    if (!email) return null;
    user = {
      email,
      displayName: clerkUser?.fullName ?? clerkUser?.firstName ?? email.split("@")[0],
      fullName: clerkUser?.fullName ?? null,
    };
  }

  if (!user) return null;
  const db = await ensureDatabase();
  const ownWorkspaceId = `ws_${user.email.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 44)}`;
  const ownerEmail = user.email.toLowerCase();

  await db.prepare("INSERT OR IGNORE INTO workspaces (id, owner_email, name, slug, plan, credits, created_at) VALUES (?, ?, ?, ?, 'free', 500, ?)")
    .bind(ownWorkspaceId, user.email, `${user.displayName}'s Workspace`, ownWorkspaceId.slice(3), now()).run();
  await db.prepare("INSERT INTO workspace_members (id, workspace_id, email, role, status, invited_by, created_at, joined_at) VALUES (?, ?, ?, 'owner', 'active', ?, ?, ?) ON CONFLICT(workspace_id, email) DO NOTHING")
    .bind(id("member"), ownWorkspaceId, ownerEmail, ownerEmail, now(), now()).run();

  let workspaceId = ownWorkspaceId;
  let role: MemberRole = "owner";

  const store = await cookies();
  const requested = store.get(ACTIVE_WORKSPACE_COOKIE)?.value;
  if (requested && requested !== ownWorkspaceId) {
    const membership = await db.prepare("SELECT role FROM workspace_members WHERE workspace_id = ? AND email = ? AND status = 'active'")
      .bind(requested, ownerEmail).first<{ role: MemberRole }>();
    if (membership) { workspaceId = requested; role = membership.role; }
  }

  return { user, workspaceId, role, db };
}

export function unauthorized() {
  return Response.json({ error: "Sign in to continue.", code: "UNAUTHORIZED" }, { status: 401 });
}
