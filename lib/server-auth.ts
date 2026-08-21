import { getChatGPTUser } from "../app/chatgpt-auth";
import { ensureDatabase, now } from "./db";

export async function requireApiUser() {
  const user = await getChatGPTUser();
  if (!user) return null;
  const db = await ensureDatabase();
  const workspaceId = `ws_${user.email.toLowerCase().replace(/[^a-z0-9]/g, "_").slice(0, 44)}`;
  await db.prepare("INSERT OR IGNORE INTO workspaces (id, owner_email, name, slug, plan, credits, created_at) VALUES (?, ?, ?, ?, 'free', 500, ?)")
    .bind(workspaceId, user.email, `${user.displayName}'s Workspace`, workspaceId.slice(3), now()).run();
  return { user, workspaceId, db };
}

export function unauthorized() {
  return Response.json({ error: "Sign in with ChatGPT to continue.", code: "UNAUTHORIZED" }, { status: 401 });
}
